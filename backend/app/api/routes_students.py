"""
Student Management and 8.xlsx Scorecard Endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.entities import Student
from app.models.schemas import StudentResponse, StudentScoreSummary
from app.services.scoring_service import ScoringService

router = APIRouter(prefix="/students", tags=["Students"])


@router.get("", response_model=list[StudentResponse])
async def list_students(
    role: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(Student)
    if role:
        query = query.where(Student.role.ilike(f"%{role}%"))
    if status:
        query = query.where(Student.status == status.upper())
    res = await db.execute(query)
    return res.scalars().all()


@router.get("/scoreboard/all", response_model=list[StudentScoreSummary])
async def get_all_scoreboards(db: AsyncSession = Depends(get_db)):
    return await ScoringService.get_all_summaries(db)


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(student_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Student).where(Student.id == student_id))
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.get("/{student_id}/score", response_model=StudentScoreSummary)
async def get_student_score(student_id: str, db: AsyncSession = Depends(get_db)):
    summary = await ScoringService.get_student_score_summary(student_id, db)
    if not summary:
        raise HTTPException(status_code=404, detail="Student not found or no score available")
    return summary
