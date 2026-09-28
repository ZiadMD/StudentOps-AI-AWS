"""
Member Q&A Endpoints.
Workflow: Member asks questions -> Committee Head reviews & answers.
"""
from typing import Optional
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.entities import MemberQuestion, Student, User, utcnow
from app.models.schemas import QuestionCreateRequest, QuestionAnswerRequest, QuestionResponse

router = APIRouter(prefix="/questions", tags=["Questions"])


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def ask_question(
    body: QuestionCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Submits a question from a member for the Social Media Committee Head.
    """
    student_id = current_user.student_id
    if not student_id:
        raise HTTPException(status_code=403, detail="No linked student profile found")
        
    std_res = await db.execute(select(Student).where(Student.id == student_id))
    student = std_res.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=400, detail="Cannot identify student profile for question submission.")

    team_id = current_user.team_id or "team_media"

    q_id = f"q_{uuid.uuid4().hex[:12]}"
    question = MemberQuestion(
        id=q_id,
        student_id=student_id,
        team_id=team_id,
        title=body.title.strip(),
        content=body.content.strip(),
        status="OPEN"
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)

    std_res = await db.execute(select(Student).where(Student.id == student_id))
    student = std_res.scalar_one_or_none()

    return QuestionResponse(
        id=question.id,
        student_id=question.student_id,
        student_name=student.full_name if student else None,
        title=question.title,
        content=question.content,
        status=question.status,
        asked_at=question.asked_at,
        answered_by_name=None,
        answer="",
        answered_at=None
    )


@router.get("", response_model=list[QuestionResponse])
async def list_questions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves questions:
    - Committee Head / Lead: views committee questions to answer them.
    - HR Leader / HR Member: views questions for operational support.
    - Member: views own asked questions and their answers.
    - HR Head: views high-level question stream.
    """
    query = select(MemberQuestion, Student, User).outerjoin(
        Student, MemberQuestion.student_id == Student.id
    ).outerjoin(
        User, MemberQuestion.answered_by_user_id == User.id
    ).order_by(MemberQuestion.asked_at.desc())

    if current_user.role in ("committee_member", "member"):
        query = query.where(MemberQuestion.student_id == current_user.student_id)
    elif current_user.role in ("committee_head", "team_lead", "committee_hr_leader", "committee_hr_member"):
        if current_user.team_id:
            query = query.where(MemberQuestion.team_id == current_user.team_id)

    res = await db.execute(query)
    rows = res.all()

    return [
        QuestionResponse(
            id=q.id,
            student_id=q.student_id,
            student_name=std.full_name if std else None,
            title=q.title,
            content=q.content,
            status=q.status,
            asked_at=q.asked_at,
            answered_by_name=answered.full_name if answered else None,
            answer=q.answer or "",
            answered_at=q.answered_at
        )
        for q, std, answered in rows
    ]


@router.post("/{question_id}/answer", response_model=QuestionResponse)
async def answer_question(
    question_id: str,
    body: QuestionAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_head", "team_lead", "hr_admin", "region_hr_head"]))
):
    """
    Committee Head, HR Admin, or Regional HR Head answers a member's question.
    """
    res = await db.execute(select(MemberQuestion).where(MemberQuestion.id == question_id))
    q = res.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    if current_user.role in ["committee_head", "team_lead"] and q.team_id != current_user.team_id:
        raise HTTPException(status_code=403, detail="Cannot answer questions from another committee")

    q.answer = body.answer.strip()
    q.status = "ANSWERED"
    q.answered_by_user_id = current_user.id
    q.answered_at = utcnow()

    await db.commit()
    await db.refresh(q)

    std_res = await db.execute(select(Student).where(Student.id == q.student_id))
    std = std_res.scalar_one_or_none()

    return QuestionResponse(
        id=q.id,
        student_id=q.student_id,
        student_name=std.full_name if std else None,
        title=q.title,
        content=q.content,
        status=q.status,
        asked_at=q.asked_at,
        answered_by_name=current_user.full_name,
        answer=q.answer,
        answered_at=q.answered_at
    )
