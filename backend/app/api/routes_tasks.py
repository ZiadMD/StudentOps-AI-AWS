"""
Tasks and Submissions Endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.entities import Task, Submission, Student, User
from app.models.schemas import TaskSchema, SubmissionSchema

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=list[TaskSchema])
async def list_tasks(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user)
):
    res = await db.execute(select(Task).order_by(Task.task_number.asc()))
    tasks = res.scalars().all()
    results = []
    for t in tasks:
        sub_res = await db.execute(
            select(Submission).where(Submission.task_id == t.id)
        )
        submissions = sub_res.scalars().all()
        results.append(TaskSchema(
            id=t.id,
            task_number=t.task_number,
            title=t.title,
            description=t.description,
            deadline=t.deadline,
            max_score=t.max_score,
            score_rule=t.score_rule,
            submission_count=sum(1 for s in submissions if s.status != "PENDING"),
            pending_count=sum(1 for s in submissions if s.status == "PENDING")
        ))
    return results


@router.get("/{task_id}/submissions", response_model=list[SubmissionSchema])
async def list_submissions_for_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lists task submissions scoped by role:
    - hr_admin: sees all submissions for this task.
    - team_lead: sees submissions only for members of their assigned team.
    - member: sees only their own submission.
    """
    query = (
        select(Submission, Student, Task)
        .join(Student, Submission.student_id == Student.id)
        .join(Task, Submission.task_id == Task.id)
        .where(Submission.task_id == task_id)
    )

    if current_user.role == "team_lead":
        query = query.where(Student.team_id == current_user.team_id)
    elif current_user.role == "member":
        query = query.where(Submission.student_id == current_user.student_id)

    res = await db.execute(query)
    records = res.all()
    return [
        SubmissionSchema(
            id=sub.id,
            task_id=sub.task_id,
            task_title=t.title,
            student_id=std.id,
            student_name=std.full_name,
            submitted_at=sub.submitted_at,
            status=sub.status,
            score=sub.score,
            file_url=sub.file_url,
            reviewer_notes=sub.reviewer_notes
        )
        for sub, std, t in records
    ]
