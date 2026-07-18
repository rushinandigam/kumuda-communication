import asyncio
from typing import Any, Dict, List, Optional

import httpx
from loguru import logger


class WhatsAppClientError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"WhatsApp API error {status_code}: {detail}")


class WhatsAppClient:
    def __init__(self, api_url: str, bearer_token: str, phone_number_id: str):
        self._base_url = api_url.rstrip("/")
        self._phone_number_id = phone_number_id
        self._headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        }
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers=self._headers,
        )

    @classmethod
    def from_credentials(cls, credentials: Dict[str, Any]) -> "WhatsAppClient":
        return cls(
            api_url=credentials["api_url"],
            bearer_token=credentials["bearer_token"],
            phone_number_id=credentials["phone_number_id"],
        )

    @staticmethod
    def _normalize_phone(number: str) -> str:
        return number.lstrip("+").replace(" ", "").replace("-", "")

    @property
    def _messages_url(self) -> str:
        return f"{self._base_url}/{self._phone_number_id}/messages"

    async def send_text_message(self, to: str, text: str) -> Dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": self._normalize_phone(to),
            "type": "text",
            "text": {"body": text},
        }
        return await self._send(payload)

    async def send_template_message(
        self,
        to: str,
        template_name: str,
        language: str,
        components: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": self._normalize_phone(to),
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "policy": "deterministic",
                    "code": language,
                },
                "components": components,
            },
        }
        return await self._send(payload)

    async def _send(self, payload: Dict[str, Any], retries: int = 3) -> Dict[str, Any]:
        for attempt in range(retries):
            try:
                response = await self._client.post(self._messages_url, json=payload)

                if response.status_code == 429:
                    wait = min(2**attempt, 8)
                    logger.warning(
                        f"WhatsApp rate limited, retrying in {wait}s (attempt {attempt + 1})"
                    )
                    await asyncio.sleep(wait)
                    continue

                if response.status_code >= 400:
                    logger.error(f"WhatsApp API error {response.status_code}: {response.text}")
                    raise WhatsAppClientError(
                        status_code=response.status_code,
                        detail=response.text,
                    )

                result = response.json()
                logger.info(f"WhatsApp API response: {result}")
                return result
            except httpx.HTTPError as e:
                if attempt == retries - 1:
                    raise WhatsAppClientError(status_code=0, detail=str(e)) from e
                await asyncio.sleep(2**attempt)

        raise WhatsAppClientError(status_code=429, detail="Rate limit exceeded after retries")

    async def close(self) -> None:
        await self._client.aclose()
