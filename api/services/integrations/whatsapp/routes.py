from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import text

from api.db import db_client
from api.db.models import UserModel
from api.services.auth.depends import get_user
from api.services.integrations.whatsapp.webhook_handler import handle_incoming_message

router = APIRouter(prefix="/integrations/whatsapp", tags=["whatsapp"])


async def _store_message(
    organization_id: int,
    phone_number: str,
    direction: str,
    content: str | None = None,
    message_type: str = "text",
    template_name: str | None = None,
):
    """Store a message in whatsapp_messages table."""
    phone = phone_number.lstrip("+").replace(" ", "").replace("-", "")
    async with db_client.async_session() as session:
        await session.execute(
            text(
                "INSERT INTO whatsapp_messages "
                "(organization_id, phone_number, direction, message_type, content, template_name, created_at) "
                "VALUES (:org_id, :phone, :direction, :msg_type, :content, :template, NOW())"
            ),
            {
                "org_id": organization_id,
                "phone": phone,
                "direction": direction,
                "msg_type": message_type,
                "content": content,
                "template": template_name,
            },
        )
        await session.commit()


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    """Meta webhook verification (hub challenge).

    Meta sends GET with hub.mode=subscribe, hub.verify_token=<your token>,
    hub.challenge=<int>. We match verify_token against any messaging config's
    webhook_verify_token and echo back the challenge.
    """
    if hub_mode != "subscribe" or not hub_verify_token or not hub_challenge:
        raise HTTPException(status_code=403, detail="Verification failed")

    from sqlalchemy.future import select
    from api.db.models import MessagingConfigurationModel

    async with db_client.async_session() as session:
        result = await session.execute(
            select(MessagingConfigurationModel).where(
                MessagingConfigurationModel.webhook_verify_token == hub_verify_token
            )
        )
        matching_config = result.scalars().first()

    if matching_config:
        logger.info(f"Webhook verified for config id={matching_config.id}")
        return int(hub_challenge)

    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def receive_webhook(request: Request):
    """Process incoming WhatsApp webhook events (messages, statuses, etc.)."""
    payload = await request.json()
    logger.info(f"WhatsApp webhook received: {payload}")

    try:
        entry = payload.get("entry", [])
        for e in entry:
            changes = e.get("changes", [])
            for change in changes:
                value = change.get("value", {})
                messages = value.get("messages", [])
                statuses = value.get("statuses", [])
                metadata = value.get("metadata", {})
                phone_number_id = metadata.get("phone_number_id")

                if not phone_number_id:
                    continue

                # Process incoming messages
                for message in messages:
                    sender = message.get("from", "")
                    msg_type = message.get("type", "")

                    if msg_type == "text":
                        text_body = message.get("text", {}).get("body", "")
                        if sender and text_body:
                            logger.info(f"Incoming message from {sender}: {text_body[:50]}")
                            await handle_incoming_message(
                                phone_number_id=phone_number_id,
                                sender_phone=sender,
                                message_text=text_body,
                            )
                            # Store inbound message
                            from sqlalchemy.future import select
                            from api.db.models import MessagingConfigurationModel

                            async with db_client.async_session() as session:
                                result = await session.execute(
                                    select(MessagingConfigurationModel).where(
                                        MessagingConfigurationModel.credentials["phone_number_id"].astext == phone_number_id
                                    )
                                )
                                config = result.scalars().first()
                            if config:
                                await _store_message(
                                    organization_id=config.organization_id,
                                    phone_number=sender,
                                    direction="inbound",
                                    content=text_body,
                                )
                    else:
                        logger.info(f"Incoming {msg_type} message from {sender} (not processed)")

                # Log status updates (sent, delivered, read)
                for status in statuses:
                    logger.info(
                        f"Message status: {status.get('status')} for {status.get('recipient_id')}"
                    )
    except Exception as e:
        logger.error(f"WhatsApp webhook processing error: {e}", exc_info=True)

    return {"status": "ok"}


class WhatsAppSessionListResponse(BaseModel):
    sessions: list


class WhatsAppSendMessageRequest(BaseModel):
    to: str
    text: str | None = None
    template_name: str | None = None
    template_language: str = "en"
    template_components: list | None = None


class WhatsAppManualReplyRequest(BaseModel):
    text: str


class WhatsAppSessionUpdateRequest(BaseModel):
    auto_reply: bool | None = None
    is_active: bool | None = None


@router.post("/send")
async def send_whatsapp_message(
    body: WhatsAppSendMessageRequest,
    user: UserModel = Depends(get_user),
):
    """Send a message to any phone number using the org's default messaging config."""
    configs = await db_client.list_messaging_configurations(
        organization_id=user.selected_organization_id
    )
    config = next((c for c in configs if c.is_default), configs[0] if configs else None)
    if not config:
        raise HTTPException(
            status_code=400,
            detail="No messaging configuration found. Create one first.",
        )

    from api.services.whatsapp.client import WhatsAppClient

    client = WhatsAppClient.from_credentials(config.credentials)
    try:
        if body.template_name:
            result = await client.send_template_message(
                to=body.to,
                template_name=body.template_name,
                language=body.template_language,
                components=body.template_components or [],
            )
            await _store_message(
                organization_id=user.selected_organization_id,
                phone_number=body.to,
                direction="outbound",
                content=f"[Template: {body.template_name}]",
                message_type="template",
                template_name=body.template_name,
            )
        elif body.text:
            result = await client.send_text_message(to=body.to, text=body.text)
            await _store_message(
                organization_id=user.selected_organization_id,
                phone_number=body.to,
                direction="outbound",
                content=body.text,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Either 'text' or 'template_name' must be provided.",
            )
    finally:
        await client.close()

    return {"status": "sent", "to": body.to, "response": result}


@router.get("/conversations")
async def list_conversations(user: UserModel = Depends(get_user)):
    """List all phone numbers with message history, like WhatsApp Web contacts list."""
    async with db_client.async_session() as session:
        result = await session.execute(
            text(
                "SELECT phone_number, "
                "MAX(created_at) as last_message_at, "
                "COUNT(*) as message_count, "
                "(SELECT content FROM whatsapp_messages m2 "
                " WHERE m2.phone_number = m.phone_number AND m2.organization_id = :org_id "
                " ORDER BY m2.created_at DESC LIMIT 1) as last_message "
                "FROM whatsapp_messages m "
                "WHERE organization_id = :org_id "
                "GROUP BY phone_number "
                "ORDER BY MAX(created_at) DESC"
            ),
            {"org_id": user.selected_organization_id},
        )
        rows = result.fetchall()

    conversations = []
    for row in rows:
        conversations.append({
            "phone_number": row.phone_number,
            "last_message_at": row.last_message_at.isoformat() if row.last_message_at else None,
            "message_count": row.message_count,
            "last_message": row.last_message,
        })
    return {"conversations": conversations}


@router.get("/conversations/{phone_number}/messages")
async def get_conversation_messages(
    phone_number: str,
    user: UserModel = Depends(get_user),
):
    """Get all messages for a phone number, ordered by time."""
    phone = phone_number.lstrip("+").replace(" ", "").replace("-", "")
    async with db_client.async_session() as session:
        result = await session.execute(
            text(
                "SELECT id, direction, message_type, content, template_name, status, created_at "
                "FROM whatsapp_messages "
                "WHERE organization_id = :org_id AND phone_number = :phone "
                "ORDER BY created_at ASC"
            ),
            {"org_id": user.selected_organization_id, "phone": phone},
        )
        rows = result.fetchall()

    messages = []
    for row in rows:
        messages.append({
            "id": row.id,
            "direction": row.direction,
            "role": "assistant" if row.direction == "outbound" else "user",
            "message_type": row.message_type,
            "text": row.content or "",
            "template_name": row.template_name,
            "status": row.status,
            "timestamp": row.created_at.isoformat() if row.created_at else None,
        })
    return {"messages": messages}


@router.get("/sessions")
async def list_whatsapp_sessions(
    user: UserModel = Depends(get_user),
    status: str = Query("active", regex="^(active|all)$"),
):
    sessions = await db_client.list_sessions(
        organization_id=user.selected_organization_id,
        active_only=(status == "active"),
    )
    return {"sessions": [_session_to_dict(s) for s in sessions]}


@router.get("/sessions/{session_id}")
async def get_whatsapp_session(session_id: int, user: UserModel = Depends(get_user)):
    session = await db_client.get_session_by_id(
        session_id=session_id, organization_id=user.selected_organization_id
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_dict(session)


@router.get("/sessions/{session_id}/messages")
async def get_whatsapp_session_messages(
    session_id: int, user: UserModel = Depends(get_user)
):
    session = await db_client.get_session_by_id(
        session_id=session_id, organization_id=user.selected_organization_id
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    text_session = await db_client.get_workflow_run_text_session(session.workflow_run_id)
    if not text_session:
        return {"messages": []}

    turns = (text_session.session_data or {}).get("turns", [])
    messages = []
    for turn in turns:
        if turn.get("user_message"):
            messages.append({
                "role": "user",
                "text": turn["user_message"].get("text", ""),
                "timestamp": turn["user_message"].get("created_at"),
            })
        if turn.get("assistant_message"):
            messages.append({
                "role": "assistant",
                "text": turn["assistant_message"].get("text", ""),
                "timestamp": turn["assistant_message"].get("created_at"),
            })
    return {"messages": messages}


@router.post("/sessions/{session_id}/reply")
async def manual_reply(
    session_id: int,
    body: WhatsAppManualReplyRequest,
    user: UserModel = Depends(get_user),
):
    session = await db_client.get_session_by_id(
        session_id=session_id, organization_id=user.selected_organization_id
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    config = await db_client.get_messaging_configuration(
        config_id=session.messaging_configuration_id,
        organization_id=user.selected_organization_id,
    )
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    from api.services.whatsapp.client import WhatsAppClient

    client = WhatsAppClient.from_credentials(config.credentials)
    try:
        await client.send_text_message(to=session.sender_phone_number, text=body.text)
        await _store_message(
            organization_id=user.selected_organization_id,
            phone_number=session.sender_phone_number,
            direction="outbound",
            content=body.text,
        )
    finally:
        await client.close()

    return {"status": "sent"}


@router.patch("/sessions/{session_id}")
async def update_whatsapp_session(
    session_id: int,
    body: WhatsAppSessionUpdateRequest,
    user: UserModel = Depends(get_user),
):
    session = await db_client.get_session_by_id(
        session_id=session_id, organization_id=user.selected_organization_id
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.auto_reply is not None:
        await db_client.set_auto_reply(session_id=session_id, auto_reply=body.auto_reply)
    if body.is_active is not None and not body.is_active:
        await db_client.deactivate_session(session_id=session_id)

    updated = await db_client.get_session_by_id(
        session_id=session_id, organization_id=user.selected_organization_id
    )
    return _session_to_dict(updated)


def _session_to_dict(session) -> dict:
    return {
        "id": session.id,
        "messaging_configuration_id": session.messaging_configuration_id,
        "organization_id": session.organization_id,
        "workflow_id": session.workflow_id,
        "workflow_run_id": session.workflow_run_id,
        "sender_phone_number": session.sender_phone_number,
        "is_active": session.is_active,
        "auto_reply": session.auto_reply,
        "last_message_at": session.last_message_at.isoformat() if session.last_message_at else None,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }
