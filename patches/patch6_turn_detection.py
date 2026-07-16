"""Patch 6 (third-party only): fix the turn-detection hang.

Empty Google STT finals never closed a turn because:
  A. google/stt.py dropped finalized frames with empty transcript text
  B. speech_timeout strategy blocked forever waiting for non-empty text

Parts C and D (run_pipeline.py edits) are now baked into the source code.
"""

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

print("CHANGED:", CHANGED)
print("SKIPPED (already patched):", SKIPPED)
