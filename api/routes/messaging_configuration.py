from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger

from api.db import db_client
from api.db.messaging_configuration_client import MessagingConfigurationInUseError
from api.db.models import UserModel
from api.schemas.messaging_configuration import (
    MessagingConfigurationCreateRequest,
    MessagingConfigurationListResponse,
    MessagingConfigurationResponse,
    MessagingConfigurationUpdateRequest,
)
from api.services.auth.depends import get_user

router = APIRouter(prefix="/messaging-configuration", tags=["messaging-configuration"])


@router.get("", response_model=MessagingConfigurationListResponse)
async def list_messaging_configurations(user: UserModel = Depends(get_user)):
    configs = await db_client.list_messaging_configurations(
        organization_id=user.selected_organization_id
    )
    return MessagingConfigurationListResponse(
        configurations=[
            MessagingConfigurationResponse.model_validate(c) for c in configs
        ]
    )


@router.get("/{config_id}", response_model=MessagingConfigurationResponse)
async def get_messaging_configuration(
    config_id: int, user: UserModel = Depends(get_user)
):
    config = await db_client.get_messaging_configuration(
        config_id=config_id, organization_id=user.selected_organization_id
    )
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return MessagingConfigurationResponse.model_validate(config)


@router.post(
    "", response_model=MessagingConfigurationResponse, status_code=status.HTTP_201_CREATED
)
async def create_messaging_configuration(
    body: MessagingConfigurationCreateRequest, user: UserModel = Depends(get_user)
):
    config = await db_client.create_messaging_configuration(
        organization_id=user.selected_organization_id,
        name=body.name,
        provider=body.provider,
        credentials=body.credentials,
        inbound_workflow_id=body.inbound_workflow_id,
        is_default=body.is_default,
        webhook_verify_token=body.webhook_verify_token,
    )
    return MessagingConfigurationResponse.model_validate(config)


@router.patch("/{config_id}", response_model=MessagingConfigurationResponse)
async def update_messaging_configuration(
    config_id: int,
    body: MessagingConfigurationUpdateRequest,
    user: UserModel = Depends(get_user),
):
    config = await db_client.update_messaging_configuration(
        config_id=config_id,
        organization_id=user.selected_organization_id,
        name=body.name,
        credentials=body.credentials,
        inbound_workflow_id=body.inbound_workflow_id,
        webhook_verify_token=body.webhook_verify_token,
    )
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return MessagingConfigurationResponse.model_validate(config)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_messaging_configuration(
    config_id: int, user: UserModel = Depends(get_user)
):
    try:
        deleted = await db_client.delete_messaging_configuration(
            config_id=config_id, organization_id=user.selected_organization_id
        )
    except MessagingConfigurationInUseError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Configuration not found")
