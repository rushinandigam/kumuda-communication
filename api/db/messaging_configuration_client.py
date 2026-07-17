from typing import Any, Dict, List, Optional

from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select

from api.db.base_client import BaseDBClient
from api.db.models import CampaignModel, MessagingConfigurationModel


class MessagingConfigurationInUseError(Exception):
    pass


class MessagingConfigurationClient(BaseDBClient):
    async def list_messaging_configurations(
        self, organization_id: int
    ) -> List[MessagingConfigurationModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(MessagingConfigurationModel)
                .where(MessagingConfigurationModel.organization_id == organization_id)
                .order_by(MessagingConfigurationModel.created_at)
            )
            return list(result.scalars().all())

    async def get_messaging_configuration(
        self, config_id: int, organization_id: int
    ) -> Optional[MessagingConfigurationModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(MessagingConfigurationModel).where(
                    MessagingConfigurationModel.id == config_id,
                    MessagingConfigurationModel.organization_id == organization_id,
                )
            )
            return result.scalars().first()

    async def get_messaging_configuration_by_phone_number_id(
        self, phone_number_id: str
    ) -> Optional[MessagingConfigurationModel]:
        """Look up config by the phone_number_id stored in credentials JSONB."""
        async with self.async_session() as session:
            result = await session.execute(
                select(MessagingConfigurationModel).where(
                    MessagingConfigurationModel.credentials.op("->>")(
                        "phone_number_id"
                    )
                    == phone_number_id
                )
            )
            return result.scalars().first()

    async def get_default_messaging_configuration(
        self, organization_id: int
    ) -> Optional[MessagingConfigurationModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(MessagingConfigurationModel).where(
                    MessagingConfigurationModel.organization_id == organization_id,
                    MessagingConfigurationModel.is_default.is_(True),
                )
            )
            return result.scalars().first()

    async def create_messaging_configuration(
        self,
        organization_id: int,
        name: str,
        provider: str,
        credentials: Dict[str, Any],
        inbound_workflow_id: Optional[int] = None,
        is_default: bool = False,
        webhook_verify_token: Optional[str] = None,
    ) -> MessagingConfigurationModel:
        async with self.async_session() as session:
            existing_count = await session.scalar(
                select(func.count(MessagingConfigurationModel.id)).where(
                    MessagingConfigurationModel.organization_id == organization_id,
                )
            )
            if existing_count == 0:
                is_default = True
            elif is_default:
                await self._clear_default(session, organization_id)

            row = MessagingConfigurationModel(
                organization_id=organization_id,
                name=name,
                provider=provider,
                credentials=credentials,
                inbound_workflow_id=inbound_workflow_id,
                is_default=is_default,
                webhook_verify_token=webhook_verify_token,
            )
            session.add(row)
            try:
                await session.commit()
            except IntegrityError as e:
                await session.rollback()
                raise e
            await session.refresh(row)
            return row

    async def update_messaging_configuration(
        self,
        config_id: int,
        organization_id: int,
        name: Optional[str] = None,
        credentials: Optional[Dict[str, Any]] = None,
        inbound_workflow_id: Optional[int] = None,
        webhook_verify_token: Optional[str] = None,
    ) -> Optional[MessagingConfigurationModel]:
        async with self.async_session() as session:
            row = await session.get(MessagingConfigurationModel, config_id)
            if not row or row.organization_id != organization_id:
                return None

            if name is not None:
                row.name = name
            if credentials is not None:
                row.credentials = credentials
            if inbound_workflow_id is not None:
                row.inbound_workflow_id = inbound_workflow_id
            if webhook_verify_token is not None:
                row.webhook_verify_token = webhook_verify_token

            try:
                await session.commit()
            except IntegrityError as e:
                await session.rollback()
                raise e
            await session.refresh(row)
            return row

    async def delete_messaging_configuration(
        self, config_id: int, organization_id: int
    ) -> bool:
        async with self.async_session() as session:
            row = await session.get(MessagingConfigurationModel, config_id)
            if not row or row.organization_id != organization_id:
                return False

            campaign_ref = await session.execute(
                select(CampaignModel.id)
                .where(CampaignModel.messaging_configuration_id == config_id)
                .limit(1)
            )
            if campaign_ref.first():
                raise MessagingConfigurationInUseError(
                    f"Messaging configuration {config_id} is referenced by one or "
                    f"more campaigns and cannot be deleted."
                )

            await session.delete(row)
            await session.commit()
            return True

    @staticmethod
    async def _clear_default(session, organization_id: int) -> None:
        await session.execute(
            update(MessagingConfigurationModel)
            .where(
                MessagingConfigurationModel.organization_id == organization_id,
                MessagingConfigurationModel.is_default.is_(True),
            )
            .values(is_default=False)
        )
