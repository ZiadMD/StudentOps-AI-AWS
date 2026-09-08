"""
WhatsApp Endpoints for StudentOps AI.
Provides official OpenWA controls for Regional Head and client-side wa.me link generation for HR members.
"""
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles, verify_student_access
from app.models.entities import Student, Task, Submission, MemberFollowupStatus, TaskReminder, User, utcnow
from app.models.schemas import (
    OfficialWhatsAppStatus,
    OfficialWhatsAppSendRequest,
    WhatsAppDirectLinkResponse,
)
from app.providers.openwa_provider import OpenWAProvider, generate_wa_me_link, format_phone_international
from app.providers.messaging_provider import OutgoingMessage

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])
openwa = OpenWAProvider()


@router.get("/status", response_model=OfficialWhatsAppStatus)
async def get_official_status(
    current_user: User = Depends(get_current_active_user)
):
    """
    Returns live connectivity status of official organization OpenWA daemon.
    """
    status_info = await openwa.get_status()
    return OfficialWhatsAppStatus(
        configured=status_info.get("configured", True),
        status=status_info.get("status", "DISCONNECTED"),
        phone_number=status_info.get("phone_number"),
        battery=status_info.get("battery"),
        qr_code=status_info.get("qr_code"),
        session_name=status_info.get("session_name"),
        error=status_info.get("error"),
    )


@router.get("/qr")
async def get_official_qr(
    current_user: User = Depends(require_roles(["region_hr_head", "hr_admin", "committee_hr_leader", "committee_hr_member"]))
):
    """
    Returns QR authentication payload for pairing official org number or HR session.
    Restricted to HR personnel.
    """
    status_info = await openwa.get_status()
    current_status = status_info.get("status", "DISCONNECTED")
    phone = status_info.get("phone_number")

    if current_status == "CONNECTED":
        return {
            "status": "CONNECTED",
            "qr": None,
            "phone_number": phone,
            "message": f"WhatsApp is already active and paired ({phone or 'Official Number'}).",
        }

    qr = await openwa.get_qr()
    if qr:
        return {
            "status": "SCAN_QR_CODE",
            "qr": qr,
            "phone_number": phone,
            "message": "Please scan the QR code using WhatsApp on your device.",
        }

    if current_status == "AUTHENTICATING":
        return {
            "status": "AUTHENTICATING",
            "qr": None,
            "phone_number": phone,
            "message": "QR code scanned! Authenticating WhatsApp session...",
        }

    if current_status == "GATEWAY_UNAVAILABLE":
        return {
            "status": "GATEWAY_UNAVAILABLE",
            "qr": None,
            "phone_number": phone,
            "message": "Cannot reach OpenWA gateway at container port 2785. Ensure the container is healthy.",
        }

    return {
        "status": current_status,
        "qr": None,
        "phone_number": phone,
        "message": status_info.get("error") or "Session initializing or disconnected. Please retry shortly.",
    }


@router.post("/send-official")
async def send_official_message(
    body: OfficialWhatsAppSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["region_hr_head", "hr_admin"]))
):
    """
    Dispatches an official organization broadcast via the headless OpenWA container.
    Restricted to Regional Head.
    Guards against duplicate sends if gateway times out.
    """
    msg = OutgoingMessage(
        recipient_name="Recipient",
        recipient_phone=body.phone_number,
        content=body.message,
        channel="WHATSAPP_OFFICIAL",
    )
    result = await openwa.send_message(msg)

    if not result.success:
        if getattr(result, "is_uncertain", False):
            # Uncertain delivery: return non-fatal 200 payload with explicit flag to prevent auto-retries
            return {
                "success": False,
                "message_id": result.message_id,
                "recipient_phone": result.recipient_phone,
                "delivered_at": result.delivered_at,
                "delivery_status": result.delivery_status,
                "is_uncertain": True,
                "error": result.error_message,
            }
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.error_message or "Could not deliver message via OpenWA",
        )

    return {
        "success": result.success,
        "message_id": result.message_id,
        "recipient_phone": result.recipient_phone,
        "delivered_at": result.delivered_at,
        "delivery_status": getattr(result, "delivery_status", "DELIVERED"),
        "is_uncertain": False,
        "error": result.error_message,
    }


@router.post("/generate-link", response_model=WhatsAppDirectLinkResponse)
async def generate_student_whatsapp_link(
    student_id: str,
    template_type: str = "OVERDUE_TASK",
    task_id: Optional[str] = None,
    custom_text: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Generates a zero-trust wa.me deep link for HR members to follow up with assigned students
    directly from their personal devices. No personal credentials touch the server.
    """
    student = await verify_student_access(student_id, current_user, db)

    # Compose pre-filled bilingual message
    if custom_text:
        message_text = custom_text
    elif template_type == "OVERDUE_TASK":
        task_title = "Upcoming Assignment"
        if task_id:
            t_res = await db.execute(select(Task).where(Task.id == task_id))
            t = t_res.scalar_one_or_none()
            if t:
                task_title = t.title

        message_text = (
            f"Hello {student.full_name}, this is your HR coordinator from the student activity.\n"
            f"We noticed that {task_title} is pending submission. Please submit your work or reach out if you have any questions!\n\n"
            f"مرحباً {student.arabic_name}، نود تذكيرك بتسليم المهمة ({task_title}). يسعدنا تواصلك في حال واجهتك أي صعوبات."
        )
    elif template_type == "MEETING_REMINDER":
        message_text = (
            f"Hello {student.full_name}, this is your Social Media HR coordinator.\n"
            f"Friendly reminder: our upcoming committee meeting will start soon. Looking forward to seeing you there!\n\n"
            f"مرحباً {student.arabic_name}، نذكرك باقتراب موعد لقاء لجنة السوشيال ميديا القادم. نتمنى لك كل التوفيق!"
        )
    elif template_type == "TASK_DEADLINE_REMINDER":
        task_title = "Social Media Assignment"
        if task_id:
            t_res = await db.execute(select(Task).where(Task.id == task_id))
            t = t_res.scalar_one_or_none()
            if t:
                task_title = t.title
        message_text = (
            f"Hello {student.full_name}, this is a reminder from your HR coordinator.\n"
            f"The deadline for {task_title} is approaching shortly. Make sure to submit your work before the cutoff!\n\n"
            f"مرحباً {student.arabic_name}، تذكير باقتراب الموعد النهائي لتسليم مهمة ({task_title}). يرجى التأكد من التسليم في الوقت المحدد!"
        )
    elif template_type == "ATTENDANCE_WARNING":
        message_text = (
            f"Hello {student.full_name}, this is your HR coordinator.\n"
            f"We would like to follow up on your recent meeting attendance. Please let us know if everything is okay.\n\n"
            f"مرحباً {student.arabic_name}، نود الاطمئنان عليك ومتابعة الحضور في اللقاءات الأخيرة."
        )
    else:
        message_text = (
            f"Hello {student.full_name},\n"
            f"This is your HR coordinator from the student activity following up with you.\n\n"
            f"مرحباً {student.arabic_name}، نتواصل معك من فريق الموارد البشرية بالنشاط الطلابي."
        )

    link = generate_wa_me_link(student.phone, message_text)

    # Record or update followup contact timestamp
    fol_res = await db.execute(
        select(MemberFollowupStatus).where(
            MemberFollowupStatus.student_id == student_id,
            MemberFollowupStatus.status == "PENDING"
        )
    )
    fol = fol_res.scalar_one_or_none()
    if fol:
        fol.last_contacted_at = utcnow()
        fol.status = "CONTACTED"
        await db.commit()

    return WhatsAppDirectLinkResponse(
        phone=format_phone_international(student.phone),
        student_id=student.id,
        student_name=student.full_name,
        encoded_url=link,
        message_text=message_text,
    )


@router.get("/escalations")
async def list_sla_escalations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_leader", "region_hr_head", "hr_admin", "committee_hr_member"]))
):
    """
    Returns members with overdue tasks or attendance flags.
    If uncontacted for >= 3 days, flagged as is_escalated for Committee HR Leader and Regional Head.
    """
    query = (
        select(MemberFollowupStatus, Student, User)
        .join(Student, MemberFollowupStatus.student_id == Student.id)
        .join(User, MemberFollowupStatus.hr_member_id == User.id)
    )

    if current_user.role == "committee_hr_leader":
        if current_user.team_id:
            team_hr_res = await db.execute(select(User.id).where(User.team_id == current_user.team_id))
            team_hr_ids = set(team_hr_res.scalars().all())
            query = query.where(
                (Student.team_id == current_user.team_id) |
                (MemberFollowupStatus.hr_member_id.in_(team_hr_ids))
            )
    elif current_user.role == "committee_hr_member":
        query = query.where(MemberFollowupStatus.hr_member_id == current_user.id)

    res = await db.execute(query)
    records = res.all()

    now = utcnow()
    results = []
    for followup, student, hr_user in records:
        flagged = followup.flagged_at
        if flagged:
            if flagged.tzinfo is None:
                flagged = flagged.replace(tzinfo=timezone.utc)
            days_open = (now - flagged).days
        else:
            days_open = 0
        is_over_sla = days_open >= 3 and followup.status != "RESOLVED"
        if is_over_sla and not followup.is_escalated:
            followup.is_escalated = True
            await db.commit()

        results.append({
            "id": followup.id,
            "student_id": student.id,
            "student_name": student.full_name,
            "arabic_name": student.arabic_name,
            "phone": student.phone,
            "hr_member_id": hr_user.id,
            "hr_member_name": hr_user.full_name,
            "flagged_reason": followup.flagged_reason,
            "flagged_at": followup.flagged_at,
            "last_contacted_at": followup.last_contacted_at,
            "days_open": days_open,
            "status": followup.status,
            "is_escalated": followup.is_escalated or is_over_sla,
        })

    return results
