from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class MessagingConfigurationCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    provider: str = Field(default="whatsapp_cloud", max_length=32)
    credentials: Dict[str, Any] = Field(
        ...,
        description="Provider credentials: {api_url, bearer_token, phone_number_id}",
    )
    inbound_workflow_id: Optional[int] = None
    is_default: bool = False
    webhook_verify_token: Optional[str] = None


class MessagingConfigurationUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    credentials: Optional[Dict[str, Any]] = None
    inbound_workflow_id: Optional[int] = None
    webhook_verify_token: Optional[str] = None


class MessagingConfigurationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    provider: str
    credentials: Dict[str, Any]
    inbound_workflow_id: Optional[int] = None
    is_default: bool
    webhook_verify_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MessagingConfigurationListResponse(BaseModel):
    configurations: List[MessagingConfigurationResponse]
