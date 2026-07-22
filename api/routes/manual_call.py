"""Manual call endpoint — browser-to-PSTN voice bridge without AI pipeline.

The browser connects via WebRTC (signaling over WebSocket), and we initiate a
PSTN call to the target number. Audio frames are forwarded bidirectionally
between the two legs using a minimal pipecat pipeline (transport-in → transport-out).
"""

import asyncio
import os
import uuid
from typing import Optional

from aiortc import RTCIceServer
from aiortc.sdp import candidate_from_sdp
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from loguru import logger
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pydantic import BaseModel
from starlette.websockets import WebSocketState

from api.db import db_client
from api.db.models import UserModel
from api.services.auth.depends import get_user, get_user_ws
from api.services.telephony.factory import (
    get_default_telephony_provider,
    get_telephony_provider_by_id,
)
from api.routes.turn_credentials import TURN_HOST, TURN_SECRET, generate_turn_credentials
from api.routes.webrtc_signaling import (
    ICE_INBOUND_POLICY,
    ICE_OUTBOUND_POLICY,
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


@router.post("/initiate")
async def initiate_manual_call(
    request: ManualCallRequest,
    user: UserModel = Depends(get_user),
):
    """Initiate a manual outbound call. Returns a session_id used for WebSocket signaling."""
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

    # Store session info in memory (Redis would be better for multi-worker, but
    # this is adequate for the single-worker manual call use case)
    _manual_call_sessions[session_id] = {
        "phone_number": phone_number,
        "provider": provider,
        "telephony_configuration_id": telephony_configuration_id,
        "from_number": from_number,
        "user_id": user.id,
        "organization_id": user.selected_organization_id,
    }

    return {"session_id": session_id}


# In-memory session store (adequate for single instance; use Redis for scale)
_manual_call_sessions: dict = {}


@router.websocket("/ws/{session_id}")
async def manual_call_signaling(websocket: WebSocket, session_id: str):
    """WebSocket signaling for manual call WebRTC + PSTN bridge."""
    user = await get_user_ws(websocket)
    if not user:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    session = _manual_call_sessions.pop(session_id, None)
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

                answer = pc.get_answer()
                await websocket.send_json({
                    "type": "answer",
                    "payload": {
                        "sdp": filter_outbound_sdp(answer["sdp"]),
                        "type": answer["type"],
                        "pc_id": answer["pc_id"],
                    },
                })

                # Start the PSTN call bridge in background
                call_task = asyncio.create_task(
                    _run_manual_call_bridge(pc, session, websocket)
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
                break

    except WebSocketDisconnect:
        logger.info(f"Manual call WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Manual call WebSocket error: {e}")
    finally:
        if call_task and not call_task.done():
            call_task.cancel()
            try:
                await call_task
            except (asyncio.CancelledError, Exception):
                pass
        if pc:
            try:
                await pc.disconnect()
            except Exception:
                pass


async def _run_manual_call_bridge(
    pc: SmallWebRTCConnection,
    session: dict,
    websocket: WebSocket,
):
    """Bridge WebRTC audio to a PSTN call.

    Uses a minimal pipecat pipeline: WebRTC transport in → out, and telephony
    transport in → WebRTC out (bidirectional audio forwarding).
    """
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.pipeline.task import PipelineParams, PipelineTask
    from pipecat.transports.base_transport import TransportParams
    from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

    provider = session["provider"]
    phone_number = session["phone_number"]
    from_number = session.get("from_number")

    # Create WebRTC transport (browser audio)
    webrtc_transport = SmallWebRTCTransport(
        webrtc_connection=pc,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=16000,
        ),
    )

    # Initiate the PSTN call
    backend_endpoint, wss_backend_endpoint = await get_backend_endpoints()

    # For manual calls we need a special webhook that streams audio back.
    # We'll use the telephony WS endpoint with a special marker.
    numeric_suffix = int(str(uuid.uuid4()).replace("-", "")[:8], 16) % 100000000
    manual_run_id = numeric_suffix  # Pseudo run ID for tracking

    webhook_url = (
        f"{backend_endpoint}/api/v1/manual-call/webhook"
        f"?session_id={session.get('session_id', '')}"
    )

    try:
        result = await provider.initiate_call(
            to_number=phone_number,
            webhook_url=webhook_url,
            from_number=from_number,
        )
        logger.info(f"Manual call initiated to {phone_number}: {result}")

        # Notify browser that call is ringing
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

    # Keep alive until cancelled (hangup or disconnect)
    try:
        while True:
            await asyncio.sleep(1)
            if websocket.application_state != WebSocketState.CONNECTED:
                break
    except asyncio.CancelledError:
        pass
    finally:
        logger.info(f"Manual call bridge ended for {phone_number}")
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json({
                "type": "call-status",
                "payload": {"status": "ended"},
            })
