"""Core logic for processing incoming WhatsApp messages."""

from uuid import uuid4

from loguru import logger

from api.db import db_client
from api.enums import WorkflowRunMode
from api.services.whatsapp.client import WhatsAppClient
from api.services.workflow.text_chat_runner import (
    default_text_chat_checkpoint,
)
from api.services.workflow.text_chat_session_service import (
    append_text_chat_user_message,
    default_text_chat_session_data,
    execute_pending_text_chat_turn,
    initialize_text_chat_session,
)


async def handle_incoming_message(
    *,
    phone_number_id: str,
    sender_phone: str,
    message_text: str,
) -> None:
    """Process a single inbound WhatsApp text message: AI auto-reply."""
    config = await db_client.get_messaging_configuration_by_phone_number_id(
        phone_number_id
    )
    if not config:
        logger.warning(f"No messaging config for phone_number_id={phone_number_id}")
        return

    if not config.inbound_workflow_id:
        logger.warning(f"Messaging config {config.id} has no inbound workflow set")
        return

    organization_id = config.organization_id
    workflow_id = config.inbound_workflow_id

    # Find or create a session for this sender
    wa_session = await db_client.get_active_session(
        messaging_configuration_id=config.id,
        sender_phone_number=sender_phone,
    )

    if wa_session and not wa_session.auto_reply:
        logger.info(f"Auto-reply disabled for session {wa_session.id}, skipping")
        await db_client.touch_session(wa_session.id)
        return

    if not wa_session:
        # Create a new workflow run for this conversation
        workflow = await db_client.get_workflow(
            workflow_id, organization_id=organization_id
        )
        if not workflow:
            logger.error(f"Workflow {workflow_id} not found for org {organization_id}")
            return

        workflow_run = await db_client.create_workflow_run(
            name=f"WA-{sender_phone[-4:]}-{uuid4().hex[:6].upper()}",
            workflow_id=workflow_id,
            mode=WorkflowRunMode.WHATSAPP.value,
            user_id=workflow.user_id,
            initial_context={"sender_phone": sender_phone, "channel": "whatsapp"},
            organization_id=organization_id,
        )

        # Create the text chat session for this run
        text_session = await db_client.ensure_workflow_run_text_session(
            workflow_run.id,
            session_data=default_text_chat_session_data(),
            checkpoint=default_text_chat_checkpoint(),
        )

        # Initialize (runs greeting turn if applicable)
        text_session = await initialize_text_chat_session(
            run_id=workflow_run.id,
            text_session=text_session,
        )

        wa_session = await db_client.create_session(
            messaging_configuration_id=config.id,
            organization_id=organization_id,
            workflow_id=workflow_id,
            workflow_run_id=workflow_run.id,
            sender_phone_number=sender_phone,
        )
    else:
        await db_client.touch_session(wa_session.id)

    # Append the user message and execute the AI turn
    run_id = wa_session.workflow_run_id
    text_session = await db_client.get_workflow_run_text_session(run_id)
    if not text_session:
        logger.error(f"Text session missing for workflow_run_id={run_id}")
        return

    try:
        text_session = await append_text_chat_user_message(
            run_id=run_id,
            text_session=text_session,
            user_text=message_text,
            expected_revision=None,
        )

        text_session = await execute_pending_text_chat_turn(
            workflow_id=wa_session.workflow_id,
            run_id=run_id,
            text_session=text_session,
        )
    except Exception as e:
        logger.error(f"WhatsApp AI turn failed for session {wa_session.id}: {e}")
        return

    # Extract assistant reply
    turns = (text_session.session_data or {}).get("turns", [])
    assistant_text = None
    if turns:
        last_turn = turns[-1]
        assistant_msg = last_turn.get("assistant_message")
        if assistant_msg:
            assistant_text = assistant_msg.get("text", "").strip()

    if not assistant_text:
        logger.warning(f"No assistant text generated for session {wa_session.id}")
        return

    # Send the reply via WhatsApp
    client = WhatsAppClient.from_credentials(config.credentials)
    try:
        await client.send_text_message(to=sender_phone, text=assistant_text)
        logger.info(
            f"WhatsApp reply sent to {sender_phone} (session {wa_session.id})"
        )
    except Exception as e:
        logger.error(f"Failed to send WhatsApp reply: {e}")
    finally:
        await client.close()
