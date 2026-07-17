from __future__ import annotations

from api.services.integrations.base import IntegrationPackageSpec
from api.services.integrations.registry import register_package

from .routes import router as whatsapp_router

PACKAGE = register_package(
    IntegrationPackageSpec(
        name="whatsapp",
        routers=(whatsapp_router,),
    )
)

__all__ = ["PACKAGE"]
