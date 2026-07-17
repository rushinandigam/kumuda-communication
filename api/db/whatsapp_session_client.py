from datetime import UTC, datetime, timedelta
from typing import List, Optional

from sqlalchemy import func, update
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload

from api.db.base_client import BaseDBClient
from api.db.models import WhatsAppSessionModel


SESSION_INACTIVITY_HOURS = 24


class WhatsAppSessionClient(BaseDBClient):
    async def get_active_session(
        self,
        messaging_configuration_id: int,
        sender_phone_number: str,
    ) -> Optional[WhatsAppSessionModel]:
        """Find the active session for a sender on this config, respecting inactivity expiry."""
        async with self.async_session() as session:
            cutoff = datetime.now(UTC) - timedelta(hours=SESSION_INACTIVITY_HOURS)
            result = await session.execute(
                select(WhatsAppSessionModel).where(
                    WhatsAppSessionModel.messaging_configuration_id
                    == messaging_configuration_id,
                    WhatsAppSessionModel.sender_phone_number == sender_phone_number,
                    WhatsAppSessionModel.is_active.is_(True),
                    WhatsAppSessionModel.last_message_at > cutoff,
                )
            )
            return result.scalars().first()

    async def create_session(
        self,
        messaging_configuration_id: int,
        organization_id: int,
        workflow_id: int,
        workflow_run_id: int,
        sender_phone_number: str,
    ) -> WhatsAppSessionModel:
        async with self.async_session() as session:
            # Deactivate any stale sessions for this sender
            await session.execute(
                update(WhatsAppSessionModel)
                .where(
                    WhatsAppSessionModel.messaging_configuration_id
                    == messaging_configuration_id,
                    WhatsAppSessionModel.sender_phone_number == sender_phone_number,
                    WhatsAppSessionModel.is_active.is_(True),
                )
                .values(is_active=False)
            )

            row = WhatsAppSessionModel(
                messaging_configuration_id=messaging_configuration_id,
                organization_id=organization_id,
                workflow_id=workflow_id,
                workflow_run_id=workflow_run_id,
                sender_phone_number=sender_phone_number,
                is_active=True,
                auto_reply=True,
                last_message_at=datetime.now(UTC),
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row

    async def touch_session(self, session_id: int) -> None:
        async with self.async_session() as session:
            await session.execute(
                update(WhatsAppSessionModel)
                .where(WhatsAppSessionModel.id == session_id)
                .values(last_message_at=datetime.now(UTC))
            )
            await session.commit()

    async def deactivate_session(self, session_id: int) -> None:
        async with self.async_session() as session:
            await session.execute(
                update(WhatsAppSessionModel)
                .where(WhatsAppSessionModel.id == session_id)
                .values(is_active=False)
            )
            await session.commit()

    async def set_auto_reply(self, session_id: int, auto_reply: bool) -> None:
        async with self.async_session() as session:
            await session.execute(
                update(WhatsAppSessionModel)
                .where(WhatsAppSessionModel.id == session_id)
                .values(auto_reply=auto_reply)
            )
            await session.commit()

    async def list_sessions(
        self,
        organization_id: int,
        active_only: bool = True,
        limit: int = 50,
        offset: int = 0,
    ) -> List[WhatsAppSessionModel]:
        async with self.async_session() as session:
            query = (
                select(WhatsAppSessionModel)
                .where(WhatsAppSessionModel.organization_id == organization_id)
                .order_by(WhatsAppSessionModel.last_message_at.desc())
                .limit(limit)
                .offset(offset)
            )
            if active_only:
                query = query.where(WhatsAppSessionModel.is_active.is_(True))
            result = await session.execute(query)
            return list(result.scalars().all())

    async def get_session_by_id(
        self, session_id: int, organization_id: int
    ) -> Optional[WhatsAppSessionModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(WhatsAppSessionModel).where(
                    WhatsAppSessionModel.id == session_id,
                    WhatsAppSessionModel.organization_id == organization_id,
                )
            )
            return result.scalars().first()
