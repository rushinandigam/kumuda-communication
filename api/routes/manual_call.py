"""Manual call endpoint — browser-to-PSTN voice bridge without AI pipeline.

The browser connects via WebRTC (signaling over WebSocket), and we initiate a
PSTN call to the target number. When Vobiz answers, it opens a media WebSocket
back to us. We bridge audio bidirectionally between the two connections:

  Browser (WebRTC PCM 48kHz) ↔ [resample] ↔ Vobiz WS (MULAW 8kHz)
"""

import asyncio
import base64
import fractions
import json
import time
import uuid
from typing import Optional

import audioop
import numpy as np
from aiortc.mediastreams import AudioStreamTrack, MediaStreamError
from aiortc.sdp import candidate_from_sdp
from av import AudioFrame
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from loguru import logger
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pydantic import BaseModel
from starlette.responses import HTMLResponse
from starlette.websockets import WebSocketState

from api.db import db_client
from api.db.models import UserModel
from api.services.auth.depends import get_user, get_user_ws
from api.services.telephony.factory import (
    get_default_telephony_provider,
    get_telephony_provider_by_id,
)
from api.routes.webrtc_signaling import (
    ICE_INBOUND_POLICY,
    filter_outbound_sdp,
    _keep_candidate,
    get_ice_servers,
)
from api.utils.common import get_backend_endpoints

router = APIRouter(prefix="/manual-call")


class ManualCallRequest(BaseModel):
    phone_number: str
    telephony_configuration_id: Optional[int] = None
    from_phone_number_id: Optional[int] = None


# In-memory session store
_manual_call_sessions: dict = {}


class TelephonyAudioTrack(AudioStreamTrack):
    """Custom audio track that plays audio from a queue (fed by Vobiz WS)."""

    def __init__(self):
        super().__init__()
        self._queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=50)
        self._sample_rate = 48000
        self._samples_per_frame = int(0.020 * self._sample_rate)  # 20ms
        self._timestamp = 0
        self._start: Optional[float] = None

    def enqueue_pcm(self, pcm_bytes: bytes):
        """Add PCM audio (16-bit signed, 48kHz mono) to the playback queue."""
        try:
            self._queue.put_nowait(pcm_bytes)
        except asyncio.QueueFull:
            try:
                self._queue.get_nowait()
                self._queue.put_nowait(pcm_bytes)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass

    async def recv(self) -> AudioFrame:
        if self.readyState != "live":
            raise MediaStreamError

        if self._start is None:
            self._start = time.time()
        else:
            self._timestamp += self._samples_per_frame
            wait = self._start + (self._timestamp / self._sample_rate) - time.time()
            if wait > 0:
                await asyncio.sleep(wait)

        try:
            pcm_bytes = self._queue.get_nowait()
        except asyncio.QueueEmpty:
            pcm_bytes = b"\x00" * (self._samples_per_frame * 2)

        # Ensure correct frame size
        expected_size = self._samples_per_frame * 2
        if len(pcm_bytes) < expected_size:
            pcm_bytes += b"\x00" * (expected_size - len(pcm_bytes))
        elif len(pcm_bytes) > expected_size:
            pcm_bytes = pcm_bytes[:expected_size]

        frame = AudioFrame(format="s16", layout="mono", samples=self._samples_per_frame)
        frame.planes[0].update(pcm_bytes)
        frame.pts = self._timestamp
        frame.sample_rate = self._sample_rate
        frame.time_base = fractions.Fraction(1, self._sample_rate)
        return frame


@router.post("/initiate")
async def initiate_manual_call(
    request: ManualCallRequest,
    user: UserModel = Depends(get_user),
):
    """Initiate a manual outbound call. Returns a session_id for WebSocket signaling."""
    telephony_configuration_id = request.telephony_configuration_id

    if telephony_configuration_id:
        try:
            provider = await get_telephony_provider_by_id(
                telephony_configuration_id, user.selected_organization_id
            )
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="telephony_configuration_not_found")
    else:
        try:
            provider = await get_default_telephony_provider(user.selected_organization_id)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="telephony_not_configured")
        default_cfg = await db_client.get_default_telephony_configuration(
            user.selected_organization_id
        )
        telephony_configuration_id = default_cfg.id if default_cfg else None

    if not provider.validate_config():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="telephony_not_configured")

    phone_number = request.phone_number
    if not phone_number:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="phone_number_required")

    # Resolve caller ID
    from_number: Optional[str] = None
    if request.from_phone_number_id is not None and telephony_configuration_id:
        phone_row = await db_client.get_phone_number_for_config(
            request.from_phone_number_id, telephony_configuration_id
        )
        if phone_row and phone_row.is_active:
            from_number = phone_row.address_normalized

    session_id = str(uuid.uuid4())

    _manual_call_sessions[session_id] = {
        "phone_number": phone_number,
        "provider": provider,
        "telephony_configuration_id": telephony_configuration_id,
        "from_number": from_number,
        "user_id": user.id,
        "organization_id": user.selected_organization_id,
        # Coordination between WebRTC and telephony WS
        "telephony_ws_ready": asyncio.Event(),
        "telephony_ws": None,
        "vobiz_stream_id": None,
        "call_id": None,
        "webrtc_connection": None,
        "telephony_audio_track": None,
        "bridge_tasks": [],
        "hangup_event": asyncio.Event(),
    }

    return {"session_id": session_id}


@router.websocket("/ws/{session_id}")
async def manual_call_signaling(
    websocket: WebSocket,
    session_id: str,
    user: UserModel = Depends(get_user_ws),
):
    """WebSocket signaling for manual call WebRTC + PSTN bridge."""

    session = _manual_call_sessions.get(session_id)
    if not session:
        await websocket.accept()
        await websocket.send_json({"type": "error", "payload": {"message": "Invalid or expired session"}})
        await websocket.close(code=4404, reason="Session not found")
        return

    await websocket.accept()

    pc: Optional[SmallWebRTCConnection] = None
    call_task: Optional[asyncio.Task] = None

    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            payload = message.get("payload", {})

            if msg_type == "offer":
                sdp = payload.get("sdp")
                type_ = payload.get("type")
                pc_id = payload.get("pc_id", session_id)

                if not sdp or not type_:
                    await websocket.send_json({"type": "error", "payload": {"message": "Missing SDP"}})
                    continue

                user_ice_servers = get_ice_servers(user_id=str(user.id))
                pc = SmallWebRTCConnection(ice_servers=user_ice_servers, connection_timeout_secs=60)
                pc._pc_id = pc_id
                await pc.initialize(sdp=sdp, type=type_)

                # Set up the telephony audio track for sending audio to browser
                telephony_audio_track = TelephonyAudioTrack()
                session["telephony_audio_track"] = telephony_audio_track
                session["webrtc_connection"] = pc

                # Replace the outgoing audio track with our custom one
                pc.replace_audio_track(telephony_audio_track)

                answer = pc.get_answer()
                await websocket.send_json({
                    "type": "answer",
                    "payload": {
                        "sdp": filter_outbound_sdp(answer["sdp"]),
                        "type": answer["type"],
                        "pc_id": answer["pc_id"],
                    },
                })

                # Mark connection as invoked so is_connected() works
                await pc.connect()

                # Start the PSTN call in background
                call_task = asyncio.create_task(
                    _initiate_pstn_call(session_id, session, websocket)
                )

            elif msg_type == "ice-candidate":
                if not pc:
                    continue
                candidate_data = payload.get("candidate")
                if candidate_data:
                    candidate_str = candidate_data.get("candidate", "")
                    if not _keep_candidate(candidate_str, ICE_INBOUND_POLICY):
                        continue
                    try:
                        candidate = candidate_from_sdp(candidate_str)
                        candidate.sdpMid = candidate_data.get("sdpMid")
                        candidate.sdpMLineIndex = candidate_data.get("sdpMLineIndex")
                        await pc.add_ice_candidate(candidate)
                    except Exception as e:
                        logger.error(f"Failed to add ICE candidate: {e}")

            elif msg_type == "hangup":
                logger.info(f"Manual call hangup requested for session {session_id}")
                session["hangup_event"].set()
                break

    except WebSocketDisconnect:
        logger.info(f"Manual call WebSocket disconnected: {session_id}")
        session["hangup_event"].set()
    except Exception as e:
        logger.error(f"Manual call WebSocket error: {e}")
        session["hangup_event"].set()
    finally:
        # Cancel bridge tasks
        for task in session.get("bridge_tasks", []):
            if not task.done():
                task.cancel()
        if call_task and not call_task.done():
            call_task.cancel()
            try:
                await call_task
            except (asyncio.CancelledError, Exception):
                pass
        # Disconnect WebRTC
        if pc:
            try:
                await pc.disconnect()
            except Exception:
                pass
        # Close telephony WS if still open
        tel_ws = session.get("telephony_ws")
        if tel_ws and tel_ws.application_state == WebSocketState.CONNECTED:
            try:
                await tel_ws.close()
            except Exception:
                pass
        # Hangup the PSTN call via API
        await _hangup_pstn_call(session)
        # Cleanup session
        _manual_call_sessions.pop(session_id, None)


async def _initiate_pstn_call(session_id: str, session: dict, websocket: WebSocket):
    """Initiate the PSTN call and wait for it to connect."""
    provider = session["provider"]
    phone_number = session["phone_number"]
    from_number = session.get("from_number")

    backend_endpoint, _ = await get_backend_endpoints()
    webhook_url = (
        f"{backend_endpoint}/api/v1/manual-call/xml-webhook"
        f"?session_id={session_id}"
    )

    try:
        result = await provider.initiate_call(
            to_number=phone_number,
            webhook_url=webhook_url,
            from_number=from_number,
        )
        session["call_id"] = result.call_id
        logger.info(f"Manual call initiated to {phone_number}, call_id={result.call_id}")

        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json({
                "type": "call-status",
                "payload": {"status": "ringing", "phone_number": phone_number},
            })

    except Exception as e:
        logger.error(f"Failed to initiate manual call: {e}")
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json({
                "type": "call-status",
                "payload": {"status": "failed", "error": str(e)},
            })
        return

    # Wait for the telephony WS to connect (Vobiz calls back when answered)
    try:
        await asyncio.wait_for(session["telephony_ws_ready"].wait(), timeout=60)
    except asyncio.TimeoutError:
        logger.warning(f"Telephony WS did not connect within 60s for session {session_id}")
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json({
                "type": "call-status",
                "payload": {"status": "failed", "error": "Call not answered"},
            })
        return

    # Call answered - notify browser
    if websocket.application_state == WebSocketState.CONNECTED:
        await websocket.send_json({
            "type": "call-status",
            "payload": {"status": "connected"},
        })

    # Start audio bridge
    bridge_task_webrtc_to_tel = asyncio.create_task(
        _bridge_webrtc_to_telephony(session_id, session)
    )
    bridge_task_tel_to_webrtc = asyncio.create_task(
        _bridge_telephony_to_webrtc(session_id, session)
    )
    session["bridge_tasks"] = [bridge_task_webrtc_to_tel, bridge_task_tel_to_webrtc]

    # Wait for hangup or bridge failure
    hangup_event = session["hangup_event"]
    done, _ = await asyncio.wait(
        [
            asyncio.create_task(hangup_event.wait()),
            bridge_task_webrtc_to_tel,
            bridge_task_tel_to_webrtc,
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )

    # Send ended status
    if websocket.application_state == WebSocketState.CONNECTED:
        await websocket.send_json({
            "type": "call-status",
            "payload": {"status": "ended"},
        })


async def _bridge_webrtc_to_telephony(session_id: str, session: dict):
    """Read audio from WebRTC, convert to MULAW, send to Vobiz WS."""
    pc: SmallWebRTCConnection = session["webrtc_connection"]
    hangup_event = session["hangup_event"]

    # Wait for WebRTC ICE to be connected (check underlying aiortc state directly)
    for _ in range(100):  # up to 10 seconds
        state = pc._pc.connectionState
        if state == "connected":
            break
        if state in ("failed", "closed"):
            logger.error(f"[{session_id}] WebRTC connection {state}, cannot bridge audio")
            return
        await asyncio.sleep(0.1)

    if pc._pc.connectionState != "connected":
        logger.error(f"[{session_id}] WebRTC not connected after 10s (state={pc._pc.connectionState}), cannot bridge audio")
        return

    # Get the audio input track from WebRTC
    audio_track = pc.audio_input_track()
    if not audio_track:
        logger.error(f"[{session_id}] No audio input track available from WebRTC")
        return

    # recv() auto-enables the receiver, but pre-enable to avoid any race
    audio_track._receiver._enabled = True

    stream_id = session.get("vobiz_stream_id")
    ratecv_state = None  # Preserve resampling state across frames

    logger.info(f"[{session_id}] WebRTC→Telephony bridge started, stream_id={stream_id}")

    frame_count = 0
    sent_count = 0
    null_count = 0
    timeout_count = 0

    try:
        while not hangup_event.is_set():
            try:
                frame = await asyncio.wait_for(audio_track.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                timeout_count += 1
                if timeout_count <= 3 or timeout_count % 10 == 0:
                    logger.warning(f"[{session_id}] WebRTC recv timeout #{timeout_count}, state={pc._pc.connectionState}")
                if pc._pc.connectionState != "connected":
                    logger.warning(f"[{session_id}] WebRTC disconnected during bridge")
                    break
                continue
            except MediaStreamError:
                logger.info(f"[{session_id}] WebRTC media stream ended")
                break

            if frame is None:
                null_count += 1
                await asyncio.sleep(0.01)
                continue

            frame_count += 1
            if frame_count == 1:
                logger.info(f"[{session_id}] First WebRTC frame received: samples={frame.samples}, rate={frame.sample_rate}, format={frame.format.name}, layout={frame.layout.name}")
            elif frame_count % 500 == 0:
                logger.info(f"[{session_id}] WebRTC→Tel stats: frames={frame_count}, sent={sent_count}, nulls={null_count}, timeouts={timeout_count}")

            # Convert av.AudioFrame to raw PCM bytes (s16 mono)
            frame_array = frame.to_ndarray()
            if frame_array.ndim > 1 and frame_array.shape[0] > 1:
                pcm_bytes = frame_array.mean(axis=0).astype(np.int16).tobytes()
            elif frame_array.ndim > 1:
                pcm_bytes = frame_array[0].astype(np.int16).tobytes()
            else:
                pcm_bytes = frame_array.astype(np.int16).tobytes()

            # Resample from frame.sample_rate to 8000 Hz (preserve state for continuity)
            src_rate = frame.sample_rate
            if src_rate != 8000:
                pcm_bytes, ratecv_state = audioop.ratecv(
                    pcm_bytes, 2, 1, src_rate, 8000, ratecv_state
                )

            # Convert PCM to MULAW
            ulaw_bytes = audioop.lin2ulaw(pcm_bytes, 2)

            # Send to Vobiz WS
            tel_ws = session.get("telephony_ws")
            if tel_ws and tel_ws.application_state == WebSocketState.CONNECTED:
                payload = base64.b64encode(ulaw_bytes).decode("utf-8")
                msg = json.dumps({
                    "event": "media",
                    "streamId": stream_id,
                    "media": {"payload": payload},
                })
                try:
                    await tel_ws.send_text(msg)
                    sent_count += 1
                except Exception as e:
                    logger.warning(f"[{session_id}] Failed to send to telephony WS: {e}")
                    break
            else:
                logger.warning(f"[{session_id}] Telephony WS not available, frames={frame_count}, sent={sent_count}")
                break

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"[{session_id}] WebRTC→Telephony bridge error: {e}", exc_info=True)
    finally:
        logger.info(f"[{session_id}] WebRTC→Telephony bridge ended")


async def _bridge_telephony_to_webrtc(session_id: str, session: dict):
    """Read MULAW from Vobiz WS, convert to PCM, feed to WebRTC audio track."""
    telephony_audio_track: TelephonyAudioTrack = session["telephony_audio_track"]
    tel_ws = session.get("telephony_ws")
    hangup_event = session["hangup_event"]

    if not tel_ws:
        logger.error(f"[{session_id}] No telephony WS available")
        return

    ratecv_state = None  # Preserve resampling state for continuity
    logger.info(f"[{session_id}] Telephony→WebRTC bridge started")

    try:
        while not hangup_event.is_set():
            if tel_ws.application_state != WebSocketState.CONNECTED:
                break

            try:
                data = await asyncio.wait_for(tel_ws.receive_text(), timeout=2.0)
            except asyncio.TimeoutError:
                continue
            except WebSocketDisconnect:
                break

            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            if msg.get("event") == "media":
                payload_b64 = msg.get("media", {}).get("payload", "")
                if not payload_b64:
                    continue

                ulaw_bytes = base64.b64decode(payload_b64)

                # Convert MULAW to PCM (16-bit signed)
                pcm_bytes = audioop.ulaw2lin(ulaw_bytes, 2)

                # Resample from 8000 Hz to 48000 Hz (preserve state for continuity)
                pcm_bytes, ratecv_state = audioop.ratecv(
                    pcm_bytes, 2, 1, 8000, 48000, ratecv_state
                )

                # Feed to the audio track for WebRTC output
                telephony_audio_track.enqueue_pcm(pcm_bytes)

            elif msg.get("event") == "stop":
                logger.info(f"[{session_id}] Vobiz stream stopped")
                hangup_event.set()
                break

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"[{session_id}] Telephony→WebRTC bridge error: {e}", exc_info=True)
    finally:
        logger.info(f"[{session_id}] Telephony→WebRTC bridge ended")


async def _hangup_pstn_call(session: dict):
    """Terminate the PSTN call via provider API."""
    call_id = session.get("call_id")
    if not call_id:
        return

    provider = session.get("provider")
    if not provider:
        return

    try:
        # Vobiz uses DELETE to hangup a call
        import aiohttp
        endpoint = f"{provider.base_url}/v1/Account/{provider.auth_id}/Call/{call_id}/"
        headers = {
            "X-Auth-ID": provider.auth_id,
            "X-Auth-Token": provider.auth_token,
        }
        async with aiohttp.ClientSession() as http_session:
            async with http_session.delete(endpoint, headers=headers) as response:
                if response.status in (200, 204, 404):
                    logger.info(f"PSTN call {call_id} terminated successfully")
                else:
                    text = await response.text()
                    logger.warning(f"Failed to terminate PSTN call {call_id}: {response.status} {text}")
    except Exception as e:
        logger.error(f"Error terminating PSTN call {call_id}: {e}")


@router.post("/xml-webhook")
async def manual_call_xml_webhook(session_id: str):
    """Webhook hit by Vobiz when the PSTN call is answered.

    Returns XML with <Stream> element pointing to our telephony WS endpoint.
    """
    session = _manual_call_sessions.get(session_id)
    if not session:
        logger.warning(f"Manual call XML webhook: session {session_id} not found")
        return HTMLResponse(
            content='<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
            media_type="application/xml",
        )

    _, wss_backend_endpoint = await get_backend_endpoints()

    xml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">{wss_backend_endpoint}/api/v1/manual-call/telephony-ws/{session_id}</Stream>
</Response>"""

    logger.info(f"Manual call XML webhook responded for session {session_id}")
    return HTMLResponse(content=xml_response, media_type="application/xml")


@router.websocket("/telephony-ws/{session_id}")
async def manual_call_telephony_ws(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for Vobiz telephony audio stream.

    Vobiz connects here after the call is answered, sending/receiving MULAW audio.
    """
    session = _manual_call_sessions.get(session_id)
    if not session:
        await websocket.accept()
        await websocket.close(code=4404, reason="Session not found")
        return

    await websocket.accept()
    logger.info(f"Telephony WS connected for manual call session {session_id}")

    # Read the start event from Vobiz
    try:
        first_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        start_msg = json.loads(first_msg)

        if start_msg.get("event") != "start":
            logger.error(f"Expected 'start' event, got: {start_msg.get('event')}")
            await websocket.close(code=4400, reason="Expected start event")
            return

        start_data = start_msg.get("start", {})
        stream_id = start_data.get("streamId")
        call_id = start_data.get("callId")

        logger.info(f"Vobiz stream started: stream_id={stream_id}, call_id={call_id}")

        session["telephony_ws"] = websocket
        session["vobiz_stream_id"] = stream_id
        if call_id:
            session["call_id"] = call_id

        # Signal that telephony WS is ready
        session["telephony_ws_ready"].set()

    except asyncio.TimeoutError:
        logger.error(f"Timeout waiting for start event on telephony WS {session_id}")
        await websocket.close(code=4408, reason="Timeout")
        return
    except Exception as e:
        logger.error(f"Error reading start event on telephony WS {session_id}: {e}")
        await websocket.close(code=4500, reason="Error")
        return

    # Keep connection alive until hangup or disconnect.
    # The bridge tasks read/write on this WS; we just wait here to keep the
    # handler (and thus the WS) alive.
    hangup_event = session["hangup_event"]
    try:
        await hangup_event.wait()
        # Give bridge tasks a moment to finish their last send/receive
        await asyncio.sleep(0.2)
    except asyncio.CancelledError:
        pass
    finally:
        if websocket.application_state == WebSocketState.CONNECTED:
            try:
                await websocket.close()
            except Exception:
                pass
        logger.info(f"Telephony WS closed for session {session_id}")
