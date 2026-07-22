"""Email service routes — send emails via Gmail SMTP.

Configuration (SMTP credentials) is stored per-organization in Redis.
The sending is done via aiosmtplib using Gmail's SMTP server.
"""

import json
import time
from email.message import EmailMessage
from typing import List, Optional

import aiosmtplib
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, EmailStr

from api.constants import REDIS_URL
from api.db.models import UserModel
from api.services.auth.depends import get_user

router = APIRouter(prefix="/email")


class EmailConfig(BaseModel):
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    sender_email: str
    sender_name: Optional[str] = None
    app_password: str


class EmailConfigResponse(BaseModel):
    smtp_host: str
    smtp_port: int
    sender_email: str
    sender_name: Optional[str] = None
    configured: bool = True


class SendEmailRequest(BaseModel):
    to: List[EmailStr]
    cc: Optional[List[EmailStr]] = None
    bcc: Optional[List[EmailStr]] = None
    subject: str
    body: str
    is_html: bool = False


class SendEmailResponse(BaseModel):
    success: bool
    message: str


class EmailHistoryItem(BaseModel):
    id: str
    to: List[str]
    subject: str
    body: str
    sent_at: str
    status: str


async def _get_redis():
    return aioredis.from_url(REDIS_URL, decode_responses=True)


async def _get_email_config(organization_id: int) -> Optional[dict]:
    """Retrieve email config from Redis."""
    r = await _get_redis()
    try:
        config_str = await r.get(f"email_config:{organization_id}")
        if config_str:
            return json.loads(config_str)
    finally:
        await r.aclose()
    return None


async def _save_email_config(organization_id: int, config: dict) -> None:
    """Save email config to Redis."""
    r = await _get_redis()
    try:
        await r.set(f"email_config:{organization_id}", json.dumps(config))
    finally:
        await r.aclose()


@router.get("/config", response_model=Optional[EmailConfigResponse])
async def get_email_configuration(user: UserModel = Depends(get_user)):
    """Get the current email configuration (credentials masked)."""
    config = await _get_email_config(user.selected_organization_id)
    if not config:
        return None

    return EmailConfigResponse(
        smtp_host=config.get("smtp_host", "smtp.gmail.com"),
        smtp_port=config.get("smtp_port", 587),
        sender_email=config.get("sender_email", ""),
        sender_name=config.get("sender_name"),
    )


@router.post("/config")
async def save_email_configuration(
    config: EmailConfig,
    user: UserModel = Depends(get_user),
):
    """Save email SMTP configuration."""
    # Validate by attempting connection
    try:
        smtp = aiosmtplib.SMTP(
            hostname=config.smtp_host,
            port=config.smtp_port,
            use_tls=False,
            start_tls=True,
        )
        await smtp.connect()
        await smtp.login(config.sender_email, config.app_password)
        await smtp.quit()
    except Exception as e:
        logger.error(f"SMTP validation failed: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"SMTP connection failed: {str(e)}. Check credentials.",
        )

    await _save_email_config(
        user.selected_organization_id,
        config.model_dump(),
    )

    return {"message": "Email configuration saved successfully"}


@router.delete("/config")
async def delete_email_configuration(user: UserModel = Depends(get_user)):
    """Remove email configuration."""
    r = await _get_redis()
    try:
        await r.delete(f"email_config:{user.selected_organization_id}")
    finally:
        await r.aclose()
    return {"message": "Email configuration removed"}


@router.post("/send", response_model=SendEmailResponse)
async def send_email(
    request: SendEmailRequest,
    user: UserModel = Depends(get_user),
):
    """Send an email via configured SMTP."""
    config = await _get_email_config(user.selected_organization_id)
    if not config:
        raise HTTPException(status_code=400, detail="Email not configured. Set up SMTP in settings.")

    sender_email = config["sender_email"]
    sender_name = config.get("sender_name") or sender_email
    app_password = config["app_password"]
    smtp_host = config.get("smtp_host", "smtp.gmail.com")
    smtp_port = config.get("smtp_port", 587)

    msg = EmailMessage()
    msg["From"] = f"{sender_name} <{sender_email}>"
    msg["To"] = ", ".join(request.to)
    msg["Subject"] = request.subject

    if request.cc:
        msg["Cc"] = ", ".join(request.cc)

    if request.is_html:
        msg.set_content(request.body, subtype="html")
    else:
        msg.set_content(request.body)

    all_recipients = list(request.to)
    if request.cc:
        all_recipients.extend(request.cc)
    if request.bcc:
        all_recipients.extend(request.bcc)

    try:
        smtp = aiosmtplib.SMTP(
            hostname=smtp_host,
            port=smtp_port,
            use_tls=False,
            start_tls=True,
        )
        await smtp.connect()
        await smtp.login(sender_email, app_password)
        await smtp.send_message(msg, recipients=all_recipients)
        await smtp.quit()

        logger.info(f"Email sent to {request.to} from org {user.selected_organization_id}")

        # Store in sent history (Redis list)
        r = await _get_redis()
        try:
            history_entry = json.dumps({
                "to": request.to,
                "cc": request.cc,
                "subject": request.subject,
                "body": request.body[:500],
                "sent_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "sent",
            })
            key = f"email_history:{user.selected_organization_id}"
            await r.lpush(key, history_entry)
            await r.ltrim(key, 0, 99)
        finally:
            await r.aclose()

        return SendEmailResponse(success=True, message="Email sent successfully")

    except aiosmtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=401, detail="SMTP authentication failed. Check app password.")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.get("/history")
async def get_email_history(user: UserModel = Depends(get_user)):
    """Get sent email history."""
    r = await _get_redis()
    try:
        key = f"email_history:{user.selected_organization_id}"
        entries = await r.lrange(key, 0, 49)
        return [json.loads(e) for e in entries]
    finally:
        await r.aclose()
