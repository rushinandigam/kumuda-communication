"""Per-stage latency breakdown observer.

Timestamps key frame transitions in the pipeline to produce a per-turn
breakdown of where time is spent:

  user_stopped_speaking → stt_final → llm_first_token → tts_first_byte → bot_started_speaking

Emits structured JSON via WebSocket (RealtimeFeedbackType) and appends to
the in-memory logs buffer for post-call analysis.
"""

import time
from typing import TYPE_CHECKING, Callable, Optional, Awaitable

from loguru import logger

from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    TranscriptionFrame,
    UserStoppedSpeakingFrame,
    MetricsFrame,
)
from pipecat.metrics.metrics import TTFBMetricsData
from pipecat.observers.base_observer import BaseObserver, FramePushed
from pipecat.processors.frame_processor import FrameDirection

if TYPE_CHECKING:
    from api.services.pipecat.in_memory_buffers import InMemoryLogsBuffer


class LatencyBreakdownObserver(BaseObserver):
    """Measures per-stage latency within each user turn."""

    def __init__(
        self,
        *,
        ws_sender: Optional[Callable[[dict], Awaitable[None]]] = None,
        logs_buffer: Optional["InMemoryLogsBuffer"] = None,
    ):
        super().__init__()
        self._ws_sender = ws_sender
        self._logs_buffer = logs_buffer
        self._turn_start: Optional[float] = None
        self._stt_final_time: Optional[float] = None
        self._llm_ttfb_time: Optional[float] = None
        self._tts_ttfb_time: Optional[float] = None

    def _reset(self):
        self._turn_start = None
        self._stt_final_time = None
        self._llm_ttfb_time = None
        self._tts_ttfb_time = None

    async def on_push_frame(self, data: FramePushed):
        frame = data.frame
        direction = data.direction

        if direction != FrameDirection.DOWNSTREAM:
            return

        if isinstance(frame, UserStoppedSpeakingFrame):
            self._reset()
            self._turn_start = time.perf_counter()

        elif isinstance(frame, TranscriptionFrame) and self._turn_start:
            if not self._stt_final_time:
                self._stt_final_time = time.perf_counter()

        elif isinstance(frame, MetricsFrame) and self._turn_start:
            for metric_data in frame.data:
                if isinstance(metric_data, TTFBMetricsData):
                    if metric_data.processor and "LLM" in metric_data.processor:
                        if not self._llm_ttfb_time:
                            self._llm_ttfb_time = time.perf_counter()
                    elif metric_data.processor and "TTS" in metric_data.processor:
                        if not self._tts_ttfb_time:
                            self._tts_ttfb_time = time.perf_counter()

        elif isinstance(frame, BotStartedSpeakingFrame) and self._turn_start:
            now = time.perf_counter()
            breakdown = self._build_breakdown(now)
            await self._emit(breakdown)
            self._reset()

    def _build_breakdown(self, bot_started: float) -> dict:
        t0 = self._turn_start
        breakdown = {
            "total_ms": round((bot_started - t0) * 1000, 1),
        }
        if self._stt_final_time:
            breakdown["stt_ms"] = round((self._stt_final_time - t0) * 1000, 1)
        if self._llm_ttfb_time:
            breakdown["llm_ttfb_ms"] = round((self._llm_ttfb_time - t0) * 1000, 1)
        if self._tts_ttfb_time:
            breakdown["tts_ttfb_ms"] = round((self._tts_ttfb_time - t0) * 1000, 1)
        return breakdown

    async def _emit(self, breakdown: dict):
        message = {
            "type": "latency_breakdown",
            "payload": breakdown,
        }
        logger.info(f"Latency breakdown: {breakdown}")

        if self._ws_sender:
            try:
                await self._ws_sender(message)
            except Exception as e:
                logger.debug(f"Failed to send latency breakdown via WS: {e}")

        if self._logs_buffer:
            try:
                await self._logs_buffer.append(message)
            except Exception as e:
                logger.debug(f"Failed to append latency breakdown to buffer: {e}")
