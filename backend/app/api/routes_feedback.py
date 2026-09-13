"""
Member Feedback Endpoints.
Workflow: Member submits feedback for HR Members -> Flows upward to HR Leader.
HR Leader reviews and actions feedback. Confidential from HR Members and Committee Head.
HR Head has read-only oversight.
"""
from typing import Optional
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.entities import MemberFeedback, Student, User, utcnow
from app.models.schemas import FeedbackCreateRequest, FeedbackResponse, FeedbackStatusUpdate

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    body: FeedbackCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Submits member feedback regarding an HR Member flowing upward to the HR Leader.
    Allowed for Committee Members and all authenticated members.
    """
    # Determine student ID
    student_id = current_user.student_id
    if not student_id:
        raise HTTPException(status_code=403, detail="No linked student profile found")
        
    std_res = await db.execute(select(Student).where(Student.id == student_id))
    student = std_res.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=400, detail="Cannot identify student profile for feedback submission.")

    # Identify target HR Member
    target_hr_id = body.hr_member_id
    target_hr_name = body.hr_member_name

    if not target_hr_id:
        if student and student.assigned_hr_id:
            target_hr_id = student.assigned_hr_id
            hr_user_res = await db.execute(select(User).where(User.id == target_hr_id))
            hr_user = hr_user_res.scalar_one_or_none()
            if hr_user:
                target_hr_name = hr_user.full_name
        else:
            # Default to Committee HR Member
            hr_mem_res = await db.execute(
                select(User).where(
                    User.role.in_(["committee_hr_member", "hr_member"]),
                    User.team_id == (student.team_id if student else "team_media")
                )
            )
            default_hr = hr_mem_res.scalars().first()
            if default_hr:
                target_hr_id = default_hr.id
                target_hr_name = default_hr.full_name
            else:
                target_hr_name = "Social Media HR Member"

    feedback_id = f"fb_{uuid.uuid4().hex[:12]}"
    fb = MemberFeedback(
        id=feedback_id,
        student_id=student_id,
        hr_member_id=target_hr_id,
        hr_member_name=target_hr_name,
        category=body.category.upper(),
        content=body.content.strip(),
        status="SUBMITTED"
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)

    return FeedbackResponse(
        id=fb.id,
        student_id=fb.student_id,
        student_name=student.full_name if student else None,
        hr_member_id=fb.hr_member_id,
        hr_member_name=fb.hr_member_name,
        category=fb.category,
        content=fb.content,
        submitted_at=fb.submitted_at,
        reviewed_at=fb.reviewed_at,
        reviewed_by_name=None,
        status=fb.status,
        notes=fb.notes or ""
    )


@router.get("", response_model=list[FeedbackResponse])
async def list_feedbacks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves member feedback:
    - HR Leader: reviews all member feedback regarding HR members in the committee.
    - HR Head: read-only oversight of member feedback.
    - Committee Member: sees only their own submitted feedback.
    - HR Member: strictly forbidden (403) for confidentiality.
    - Committee Head: strictly forbidden (403).
    """
    if current_user.role in ("committee_head", "team_lead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Committee Head does not oversee HR feedback."
        )

    if current_user.role in ("committee_hr_member", "hr_member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Member feedback concerning HR members is strictly confidential from HR members."
        )

    query = select(MemberFeedback, Student, User).outerjoin(
        Student, MemberFeedback.student_id == Student.id
    ).outerjoin(
        User, MemberFeedback.reviewed_by_user_id == User.id
    ).order_by(MemberFeedback.submitted_at.desc())

    if current_user.role in ("committee_member", "member"):
        query = query.where(MemberFeedback.student_id == current_user.student_id)
    elif current_user.role == "committee_hr_leader":
        if current_user.team_id:
            query = query.where(Student.team_id == current_user.team_id)

    res = await db.execute(query)
    rows = res.all()

    return [
        FeedbackResponse(
            id=fb.id,
            student_id=fb.student_id,
            student_name=std.full_name if std else None,
            hr_member_id=fb.hr_member_id,
            hr_member_name=fb.hr_member_name,
            category=fb.category,
            content=fb.content,
            submitted_at=fb.submitted_at,
            reviewed_at=fb.reviewed_at,
            reviewed_by_name=reviewer.full_name if reviewer else None,
            status=fb.status,
            notes=fb.notes or ""
        )
        for fb, std, reviewer in rows
    ]


@router.patch("/{feedback_id}/status", response_model=FeedbackResponse)
async def update_feedback_status(
    feedback_id: str,
    body: FeedbackStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_leader"]))
):
    """
    HR Leader reviews and marks member feedback as REVIEWED or ACTIONED.
    HR Head is oversight-only and cannot action operational feedback (403).
    """
    res = await db.execute(select(MemberFeedback).where(MemberFeedback.id == feedback_id))
    fb = res.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    std_res = await db.execute(select(Student).where(Student.id == fb.student_id))
    std = std_res.scalar_one_or_none()
    
    if current_user.role == "committee_hr_leader":
        if not std or std.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access feedback from another committee")

    fb.status = body.status
    fb.notes = body.notes or fb.notes
    fb.reviewed_by_user_id = current_user.id
    fb.reviewed_at = utcnow()

    await db.commit()
    await db.refresh(fb)

    return FeedbackResponse(
        id=fb.id,
        student_id=fb.student_id,
        student_name=std.full_name if std else None,
        hr_member_id=fb.hr_member_id,
        hr_member_name=fb.hr_member_name,
        category=fb.category,
        content=fb.content,
        submitted_at=fb.submitted_at,
        reviewed_at=fb.reviewed_at,
        reviewed_by_name=current_user.full_name,
        status=fb.status,
        notes=fb.notes or ""
    )
