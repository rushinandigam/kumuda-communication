"""API routes for WhatsApp template management."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.db import db_client
from api.db.models import UserModel
from api.services.auth.depends import get_user
from api.services.whatsapp.templates import WhatsAppTemplateClient

router = APIRouter(prefix="/integrations/whatsapp/templates", tags=["whatsapp-templates"])


class TemplateComponentRequest(BaseModel):
    type: str = Field(..., description="HEADER, BODY, FOOTER, or BUTTONS")
    format: Optional[str] = None
    text: Optional[str] = None
    buttons: Optional[List[Dict[str, Any]]] = None


class CreateTemplateRequest(BaseModel):
    name: str = Field(..., pattern=r"^[a-z][a-z0-9_]*$", max_length=512)
    category: str = Field(..., pattern=r"^(MARKETING|UTILITY|AUTHENTICATION)$")
    language: str = Field(default="en_US")
    components: List[TemplateComponentRequest]


class DeleteTemplateRequest(BaseModel):
    name: str


async def _get_template_client(user: UserModel) -> WhatsAppTemplateClient:
    configs = await db_client.list_messaging_configurations(
        organization_id=user.selected_organization_id
    )
    config = next((c for c in configs if c.is_default), configs[0] if configs else None)
    if not config:
        raise HTTPException(status_code=400, detail="No messaging configuration found.")
    if not config.credentials.get("whatsapp_business_account_id"):
        raise HTTPException(
            status_code=400,
            detail="whatsapp_business_account_id not set in messaging configuration credentials.",
        )
    return WhatsAppTemplateClient.from_credentials(config.credentials)


@router.get("")
async def list_templates(user: UserModel = Depends(get_user)):
    """List all WhatsApp message templates for the organization."""
    client = await _get_template_client(user)
    try:
        templates = await client.list_templates()
        return {"templates": templates}
    finally:
        await client.close()


@router.post("")
async def create_template(
    body: CreateTemplateRequest,
    user: UserModel = Depends(get_user),
):
    """Create a new WhatsApp message template (submits to Meta for approval)."""
    client = await _get_template_client(user)
    try:
        components = [c.model_dump(exclude_none=True) for c in body.components]
        result = await client.create_template(
            name=body.name,
            category=body.category,
            language=body.language,
            components=components,
        )
        return {"status": "submitted", "template": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()


@router.delete("")
async def delete_template(
    body: DeleteTemplateRequest,
    user: UserModel = Depends(get_user),
):
    """Delete a WhatsApp message template by name."""
    client = await _get_template_client(user)
    try:
        result = await client.delete_template(name=body.name)
        return {"status": "deleted", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()
