"""
Tasks and Submissions Endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.entities import Task, Submission, Student, User, utcnow
from app.models.schemas import TaskSchema, SubmissionSchema, TechnicalScoreUpdate

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
    - committee_head / team_lead: sees submissions only for members of their assigned committee.
    - committee_member / member: sees only their own submission.
    - region_hr_head / committee_hr_leader / committee_hr_member: strictly forbidden (technical tasks are confidential).
    - hr_admin (legacy): permitted for system administration.
    """
    if current_user.role in ("region_hr_head", "committee_hr_leader", "committee_hr_member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: HR roles do not have permission to view technical task submissions."
        )

    query = (
        select(Submission, Student, Task)
        .join(Student, Submission.student_id == Student.id)
        .join(Task, Submission.task_id == Task.id)
        .where(Submission.task_id == task_id)
    )

    if current_user.role in ("committee_head", "team_lead"):
        query = query.where(Student.team_id == current_user.team_id)
    elif current_user.role in ("committee_member", "member"):
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
            technical_score=sub.technical_score or sub.score,
            file_url=sub.file_url,
            reviewer_notes=sub.reviewer_notes,
            graded_by_user_id=sub.graded_by_user_id
        )
        for sub, std, t in records
    ]


@router.put("/submissions/{submission_id}/review", response_model=SubmissionSchema)
async def review_submission(
    submission_id: str,
    body: TechnicalScoreUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_head", "team_lead", "hr_admin"]))
):
    """
    Committee Head reviews and assigns technical scores (/10) for member submissions.
    HR roles have no write or read permission here.
    """
    res = await db.execute(
        select(Submission, Student, Task)
        .join(Student, Submission.student_id == Student.id)
        .join(Task, Submission.task_id == Task.id)
        .where(Submission.id == submission_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")

    submission, student, task = row

    if current_user.role in ("committee_head", "team_lead"):
        if student.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: this student belongs to a different committee."
            )

    submission.score = body.score
    submission.technical_score = body.score
    submission.reviewer_notes = body.reviewer_notes or ""
    submission.reviewed_at = utcnow()
    submission.graded_by_user_id = current_user.id
    if submission.status == "PENDING":
        submission.status = "ON_TIME"

    await db.commit()
    await db.refresh(submission)

    return SubmissionSchema(
        id=submission.id,
        task_id=submission.task_id,
        task_title=task.title,
        student_id=student.id,
        student_name=student.full_name,
        submitted_at=submission.submitted_at,
        status=submission.status,
        score=submission.score,
        technical_score=submission.technical_score,
        file_url=submission.file_url,
        reviewer_notes=submission.reviewer_notes,
        graded_by_user_id=submission.graded_by_user_id
    )


@router.post("/{task_id}/submit", response_model=SubmissionSchema)
async def submit_task(
    task_id: str,
    file_url: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_member", "member"]))
):
    """Allows a committee member student to submit work for a task."""
    if not current_user.student_id:
        raise HTTPException(status_code=400, detail="User is not linked to a student record")

    task_res = await db.execute(select(Task).where(Task.id == task_id))
    task = task_res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    sub_res = await db.execute(
        select(Submission).where(
            Submission.task_id == task_id,
            Submission.student_id == current_user.student_id
        )
    )
    submission = sub_res.scalar_one_or_none()

    now = utcnow()
    status_str = "ON_TIME" if now <= task.deadline else "LATE"

    import uuid
    if not submission:
        submission = Submission(
            id=f"sub_{uuid.uuid4().hex[:12]}",
            task_id=task_id,
            student_id=current_user.student_id,
            submitted_at=now,
            status=status_str,
            file_url=file_url,
        )
        db.add(submission)
    else:
        submission.submitted_at = now
        submission.status = status_str
        submission.file_url = file_url

    await db.commit()
    await db.refresh(submission)

    std_res = await db.execute(select(Student).where(Student.id == current_user.student_id))
    std = std_res.scalar_one_or_none()

    return SubmissionSchema(
        id=submission.id,
        task_id=submission.task_id,
        task_title=task.title,
        student_id=submission.student_id,
        student_name=std.full_name if std else "",
        submitted_at=submission.submitted_at,
        status=submission.status,
        score=submission.score,
        technical_score=submission.technical_score,
        file_url=submission.file_url,
        reviewer_notes=submission.reviewer_notes,
        graded_by_user_id=submission.graded_by_user_id
    )
