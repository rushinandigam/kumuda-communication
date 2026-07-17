"""Campaign message dispatcher for WhatsApp template messages.

Mirrors the structure of campaign_call_dispatcher.py but sends template
messages via the WhatsApp API instead of placing calls.
"""

from datetime import UTC, datetime
from uuid import uuid4

from loguru import logger

from api.db import db_client
from api.db.models import CampaignModel, QueuedRunModel
from api.enums import WorkflowRunMode
from api.services.whatsapp.client import WhatsAppClient, WhatsAppClientError
from api.services.whatsapp.template import build_template_components


class CampaignMessageDispatcher:
    async def dispatch_message(
        self, campaign: CampaignModel, queued_run: QueuedRunModel
    ) -> bool:
        """Send a template message for a single queued run.

        Returns True on success, False on failure.
        """
        config = await db_client.get_messaging_configuration(
            config_id=campaign.messaging_configuration_id,
            organization_id=campaign.organization_id,
        )
        if not config:
            logger.error(
                f"Messaging config {campaign.messaging_configuration_id} not found"
            )
            return False

        context_vars = queued_run.context_variables or {}
        phone_number = context_vars.get("phone_number", "").strip()
        if not phone_number:
            logger.error(f"No phone_number in queued_run {queued_run.id} context")
            await db_client.update_queued_run(
                queued_run.id, state="failed"
            )
            return False

        # Get template config from campaign orchestrator_metadata
        orchestrator_meta = campaign.orchestrator_metadata or {}
        template_config = orchestrator_meta.get("template_config", {})
        template_name = template_config.get("name", "")
        language = template_config.get("language", "en")

        if not template_name:
            logger.error(f"No template name configured for campaign {campaign.id}")
            await db_client.update_queued_run(
                queued_run.id, state="failed"
            )
            return False

        components = build_template_components(template_config, context_vars)

        # Create a workflow run record for tracking
        workflow_run = await db_client.create_workflow_run(
            name=f"WA-CAMP-{queued_run.id}-{uuid4().hex[:4]}",
            workflow_id=campaign.workflow_id,
            mode=WorkflowRunMode.WHATSAPP.value,
            user_id=campaign.created_by,
            initial_context=context_vars,
            campaign_id=campaign.id,
            queued_run_id=queued_run.id,
            organization_id=campaign.organization_id,
        )

        client = WhatsAppClient.from_credentials(config.credentials)
        try:
            result = await client.send_template_message(
                to=phone_number,
                template_name=template_name,
                language=language,
                components=components,
            )
            logger.info(
                f"Campaign {campaign.id}: template sent to {phone_number} "
                f"(queued_run={queued_run.id})"
            )

            await db_client.update_queued_run(queued_run.id, state="processed")
            await db_client.update_workflow_run(
                workflow_run.id, is_completed=True
            )
            return True

        except WhatsAppClientError as e:
            logger.error(
                f"Campaign {campaign.id}: failed to send to {phone_number}: {e}"
            )
            await db_client.update_queued_run(queued_run.id, state="failed")
            await db_client.update_workflow_run(
                workflow_run.id,
                is_completed=True,
                extra={"error": e.detail, "status_code": e.status_code},
            )
            return False
        finally:
            await client.close()
