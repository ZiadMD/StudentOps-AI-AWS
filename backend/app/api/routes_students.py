"""
Student Management and 8.xlsx Scorecard Endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, verify_student_access
from app.models.entities import Student, User
from app.models.schemas import StudentResponse, StudentScoreSummary
from app.services.scoring_service import ScoringService

router = APIRouter(prefix="/students", tags=["Students"])


@router.get("", response_model=list[StudentResponse])
async def list_students(
    role: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lists student records with automatic organizational scoping:
    - hr_admin: sees all students across all teams.
    - team_lead: sees only members belonging to their assigned team_id.
    - member: sees only their own student profile.
    """
    query = select(Student)

    if current_user.role == "team_lead":
        query = query.where(Student.team_id == current_user.team_id)
    elif current_user.role == "member":
        query = query.where(Student.id == current_user.student_id)

    if role:
        query = query.where(Student.role.ilike(f"%{role}%"))
    if status:
        query = query.where(Student.status == status.upper())

    res = await db.execute(query)
    return res.scalars().all()


@router.get("/scoreboard/all", response_model=list[StudentScoreSummary])
async def get_all_scoreboards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves scoreboards with scoping:
    - hr_admin: full ground-truth scoreboard.
    - team_lead: scoreboard filtered to students in their team.
    - member: personal scorecard summary.
    """
    all_summaries = await ScoringService.get_all_summaries(db)

    if current_user.role == "hr_admin":
        return all_summaries
    elif current_user.role == "team_lead":
        if not current_user.team_id:
            return []
        team_res = await db.execute(
            select(Student.id).where(Student.team_id == current_user.team_id)
        )
        team_student_ids = set(team_res.scalars().all())
        return [s for s in all_summaries if s.student_id in team_student_ids]
    else:  # member
        if current_user.student_id:
            return [s for s in all_summaries if s.student_id == current_user.student_id]
        return []


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retrieves a student record after verifying permission boundary."""
    return await verify_student_access(student_id, current_user, db)


@router.get("/{student_id}/score", response_model=StudentScoreSummary)
async def get_student_score(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retrieves a student scorecard after verifying permission boundary."""
    await verify_student_access(student_id, current_user, db)
    summary = await ScoringService.get_student_score_summary(student_id, db)
    if not summary:
        raise HTTPException(status_code=404, detail="Student not found or no score available")
    return summary
