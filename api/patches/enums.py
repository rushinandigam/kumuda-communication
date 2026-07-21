"""Shim for pipecat.utils.enums (from private Dograh pipecat fork)."""

from enum import Enum


class EndTaskReason(str, Enum):
    USER_HANGUP = "user_hangup"
    USER_QUALIFIED = "user_qualified"
    END_CALL_TOOL_REASON = "end_call_tool_reason"
    VOICEMAIL_DETECTED = "voicemail_detected"
    MAX_DURATION = "max_duration"
    ERROR = "error"
    PIPELINE_ERROR = "pipeline_error"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    FAILED = "failed"


class RealtimeFeedbackType(str, Enum):
    USER_TRANSCRIPTION = "user_transcription"
    BOT_TEXT = "bot_text"
    BOT_STARTED_SPEAKING = "bot_started_speaking"
    BOT_STOPPED_SPEAKING = "bot_stopped_speaking"
    USER_STARTED_SPEAKING = "user_started_speaking"
    USER_STOPPED_SPEAKING = "user_stopped_speaking"
    FUNCTION_CALL = "function_call"
    FUNCTION_RESULT = "function_result"
    LATENCY = "latency"
