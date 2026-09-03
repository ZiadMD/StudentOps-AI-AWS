"""Standalone WhatsApp Agent test endpoint."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.whatsapp_agent import run_whatsapp_agent
from app.core.dependencies import rate_limit_agent, require_roles
from app.models.entities import User


router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Agent"])


class WhatsAppSendRequest(BaseModel):
    phone_number: str = Field(..., min_length=1, max_length=30)
    message: str = Field(..., min_length=1, max_length=4096)


@router.post("/send", dependencies=[Depends(rate_limit_agent)])
async def send_whatsapp(
    payload: WhatsAppSendRequest,
    _: User = Depends(require_roles(["hr_admin"])),
):
    """Send a manually authorized test message through WhatsApp Web."""
    return await run_whatsapp_agent(payload.phone_number, payload.message)