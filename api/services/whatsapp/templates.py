"""WhatsApp Business API template management (Meta Cloud API)."""

from typing import Any, Dict, List, Optional

import httpx
from loguru import logger


class WhatsAppTemplateClient:
    """CRUD operations for WhatsApp message templates via Meta Graph API."""

    GRAPH_API_BASE = "https://graph.facebook.com/v21.0"

    def __init__(self, bearer_token: str, waba_id: str):
        self._waba_id = waba_id
        self._headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        }
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers=self._headers,
        )

    @classmethod
    def from_credentials(cls, credentials: Dict[str, Any]) -> "WhatsAppTemplateClient":
        waba_id = credentials.get("whatsapp_business_account_id")
        if not waba_id:
            raise ValueError(
                "whatsapp_business_account_id is required in credentials for template management"
            )
        return cls(
            bearer_token=credentials["bearer_token"],
            waba_id=waba_id,
        )

    @property
    def _templates_url(self) -> str:
        return f"{self.GRAPH_API_BASE}/{self._waba_id}/message_templates"

    async def list_templates(
        self, limit: int = 100, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status

        templates = []
        url = self._templates_url
        while url:
            response = await self._client.get(url, params=params)
            data = await self._handle_response(response)
            templates.extend(data.get("data", []))
            url = data.get("paging", {}).get("next")
            params = {}

        return templates

    async def create_template(
        self,
        name: str,
        category: str,
        language: str,
        components: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        payload = {
            "name": name,
            "category": category,
            "language": language,
            "components": components,
        }
        response = await self._client.post(self._templates_url, json=payload)
        return await self._handle_response(response)

    async def delete_template(self, name: str) -> Dict[str, Any]:
        response = await self._client.delete(
            self._templates_url, params={"name": name}
        )
        return await self._handle_response(response)

    async def _handle_response(self, response: httpx.Response) -> Dict[str, Any]:
        if response.status_code >= 400:
            error_data = response.json() if response.content else {}
            error_msg = (
                error_data.get("error", {}).get("message", response.text)
            )
            logger.error(f"Meta API error {response.status_code}: {error_msg}")
            raise httpx.HTTPStatusError(
                message=error_msg,
                request=response.request,
                response=response,
            )
        return response.json()

    async def close(self) -> None:
        await self._client.aclose()
