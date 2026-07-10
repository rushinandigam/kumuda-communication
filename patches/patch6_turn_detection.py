"""Patch 6: fix the turn-detection hang (empty Google STT finals never close a turn).

Applies four coordinated edits:
  A. google/stt.py            - push finalized-but-empty TranscriptionFrame instead of dropping it
  B. speech_timeout_...py     - let the turn close when STT finalized, even with empty text
                                 (+ a public `text` property for dograh's own code to read)
  C. run_pipeline.py          - tune stop-timeout window to ~2.5s
  D. run_pipeline.py          - "didn't catch that" fallback when a turn closes with no text
"""

import re

CHANGED = []
SKIPPED = []


def patch_file(path, replacements, marker):
    with open(path) as f:
        content = f.read()

    if marker in content:
        SKIPPED.append(path)
        return

    for old, new in replacements:
        assert content.count(old) == 1, f"{path}: expected 1 occurrence, found {content.count(old)}: {old[:80]!r}"
        content = content.replace(old, new)

    with open(path, "w") as f:
        f.write(content)
    CHANGED.append(path)


# --- A: google/stt.py ---------------------------------------------------
STT_PATH = "/opt/venv/lib/python3.13/site-packages/pipecat/services/google/stt.py"

old_a = '''                for result in response.results:
                    if not result.alternatives:
                        continue

                    transcript = result.alternatives[0].transcript
                    if not transcript:
                        continue

                    primary_language = self._get_language_codes()[0]

                    if result.is_final:
                        self._last_transcript_was_final = True
                        await self.push_frame(
                            TranscriptionFrame(
                                transcript,
                                self._user_id,
                                time_now_iso8601(),
                                primary_language,
                                result=result,
                            )
                        )
                        await self.stop_processing_metrics()
                        await self._handle_transcription(
                            transcript,
                            is_final=True,
                            language=primary_language,
                        )
                    else:
                        self._last_transcript_was_final = False
                        await self.push_frame(
                            InterimTranscriptionFrame(
                                transcript,
                                self._user_id,
                                time_now_iso8601(),
                                primary_language,
                                result=result,
                            )
                        )'''

new_a = '''                for result in response.results:
                    if not result.alternatives:
                        continue

                    transcript = result.alternatives[0].transcript
                    primary_language = self._get_language_codes()[0]

                    if result.is_final:
                        # PATCHED: previously `if not transcript: continue` sat
                        # above this branch too, silently dropping finalized
                        # Google results with empty text (e.g. noise/breath
                        # that VAD treated as speech but Google transcribed as
                        # nothing). Downstream turn-stop logic waiting on a
                        # transcript would then hang forever. Always push the
                        # frame (even empty) and mark it finalized so the turn
                        # can still close.
                        self._last_transcript_was_final = True
                        await self.push_frame(
                            TranscriptionFrame(
                                transcript,
                                self._user_id,
                                time_now_iso8601(),
                                primary_language,
                                result=result,
                                finalized=True,
                            )
                        )
                        await self.stop_processing_metrics()
                        await self._handle_transcription(
                            transcript,
                            is_final=True,
                            language=primary_language,
                        )
                    else:
                        if not transcript:
                            continue
                        self._last_transcript_was_final = False
                        await self.push_frame(
                            InterimTranscriptionFrame(
                                transcript,
                                self._user_id,
                                time_now_iso8601(),
                                primary_language,
                                result=result,
                            )
                        )'''

patch_file(STT_PATH, [(old_a, new_a)], marker="PATCHED: previously `if not transcript: continue` sat")


# --- B: speech_timeout_user_turn_stop_strategy.py ------------------------
STOP_STRATEGY_PATH = "/opt/venv/lib/python3.13/site-packages/pipecat/turns/user_stop/speech_timeout_user_turn_stop_strategy.py"

old_b1 = '''    @property
    def wait_for_transcript(self) -> bool:
        """Whether transcripts gate end-of-turn signalling."""
        return self._wait_for_transcript'''

new_b1 = '''    @property
    def wait_for_transcript(self) -> bool:
        """Whether transcripts gate end-of-turn signalling."""
        return self._wait_for_transcript

    @property
    def text(self) -> str:
        """Accumulated transcript text for the current turn (may be empty)."""
        return self._text'''

old_b2 = '''        if self._vad_user_speaking:
            return

        if self._wait_for_transcript and not self._text:
            return

        if self._user_speech_wait_done and self._stt_wait_done:
            await self.trigger_user_turn_stopped()'''

new_b2 = '''        if self._vad_user_speaking:
            return

        # PATCHED: previously blocked here forever whenever STT never
        # produced any transcript text (e.g. a finalized-but-empty Google
        # STT result). self._transcript_finalized means STT explicitly told
        # us it is done with this utterance, even with nothing to
        # transcribe - that's sufficient to let the turn close instead of
        # hanging indefinitely.
        if self._wait_for_transcript and not self._text and not self._transcript_finalized:
            return

        if self._user_speech_wait_done and self._stt_wait_done:
            await self.trigger_user_turn_stopped()'''

patch_file(
    STOP_STRATEGY_PATH,
    [(old_b1, new_b1), (old_b2, new_b2)],
    marker="PATCHED: previously blocked here forever",
)


# --- C & D: dograh's own run_pipeline.py ---------------------------------
RUN_PIPELINE_PATH = "/app/api/services/pipecat/run_pipeline.py"

old_c = "    return [SpeechTimeoutUserTurnStopStrategy()]"
new_c = (
    "    # PATCHED: widen the post-silence wait to ~2.5s (was ~1.4s) so we\n"
    "    # don't cut off a user pausing mid-thought, now that empty-transcript\n"
    "    # turns can actually close instead of hanging.\n"
    "    return [SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=2.5)]"
)

old_d = '''    @user_context_aggregator.event_handler("on_user_turn_started")
    async def on_user_turn_started(aggregator, strategy):
        user_idle_handler.reset()'''

new_d = '''    @user_context_aggregator.event_handler("on_user_turn_started")
    async def on_user_turn_started(aggregator, strategy):
        user_idle_handler.reset()

    # PATCHED: when a turn closes with no transcript at all (STT genuinely
    # caught nothing - e.g. noise/silence misclassified as speech by VAD),
    # tell the LLM to apologize and ask the user to repeat instead of
    # silently running inference on an empty turn.
    @user_context_aggregator.event_handler("on_user_turn_inference_triggered")
    async def on_user_turn_inference_triggered(aggregator, strategy):
        if not getattr(strategy, "text", ""):
            message = {
                "role": "user",
                "content": (
                    "The system did not catch what the user said (no speech "
                    "was transcribed). Politely say you didn't catch that and "
                    "ask them to repeat, in the language the user has been "
                    "speaking so far."
                ),
            }
            await aggregator.push_frame(
                LLMMessagesAppendFrame([message], run_llm=True)
            )'''

with open(RUN_PIPELINE_PATH) as f:
    rp_content = f.read()

if "PATCHED: widen the post-silence wait" in rp_content:
    SKIPPED.append(RUN_PIPELINE_PATH)
else:
    assert rp_content.count(old_c) == 1, f"old_c occurrences: {rp_content.count(old_c)}"
    assert rp_content.count(old_d) == 1, f"old_d occurrences: {rp_content.count(old_d)}"
    if "from pipecat.frames.frames import LLMMessagesAppendFrame" not in rp_content:
        # Insert the import right after the last existing `from pipecat...import` line
        # in the block that already imports SileroVADAnalyzer, to keep it grouped.
        anchor = "from pipecat.audio.vad.silero import SileroVADAnalyzer\n"
        assert rp_content.count(anchor) == 1
        rp_content = rp_content.replace(
            anchor,
            anchor + "from pipecat.frames.frames import LLMMessagesAppendFrame\n",
        )
    rp_content = rp_content.replace(old_c, new_c)
    rp_content = rp_content.replace(old_d, new_d)
    with open(RUN_PIPELINE_PATH, "w") as f:
        f.write(rp_content)
    CHANGED.append(RUN_PIPELINE_PATH)

print("CHANGED:", CHANGED)
print("SKIPPED (already patched):", SKIPPED)
