"""
Tasks and Submissions Endpoints.
"""
from typing import Optional
from datetime import timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
import uuid
from sqlalchemy import func
from app.models.entities import Task, Submission, Student, User, TaskAssignment, utcnow
from app.models.schemas import (
    TaskSchema,
    SubmissionSchema,
    TaskScoreItemSchema,
    TechnicalScoreUpdate,
    TaskCreateRequest,
    TaskAssignRequest,
    TaskSubmitRequest,
)

router = APIRouter(prefix="/tasks", tags=["Tasks"])


async def get_task_reminder_candidates(
    task_id: str,
    db: AsyncSession,
    pre_deadline: bool = True
) -> list[Student]:
    """
    Finds students eligible for task reminders with strict fail-closed semantics.
    For HR-created tasks: empty assignments FAIL CLOSED (returns []).
    Pre-deadline: only non-submitters (status == 'PENDING') among assigned members.
    Post-deadline: re-checks latest submission, only still-missing members.
    """
    task_res = await db.execute(select(Task).where(Task.id == task_id))
    task = task_res.scalar_one_or_none()
    if not task:
        return []

    # Query explicit assignments
    assign_res = await db.execute(
        select(TaskAssignment.student_id).where(TaskAssignment.task_id == task_id)
    )
    assigned_ids = list(assign_res.scalars().all())

    # Fail closed: if HR-created task has no assignments, return empty list
    if task.created_by_user_id is not None and not assigned_ids:
        return []

    # If legacy seeded task has no explicit assignments, fallback to all active students
    if not assigned_ids and task.created_by_user_id is None:
        std_res = await db.execute(select(Student.id).where(Student.status == "ACTIVE"))
        assigned_ids = list(std_res.scalars().all())

    if not assigned_ids:
        return []

    # Find members who still have PENDING status or no submission
    sub_res = await db.execute(
        select(Submission.student_id).where(
            Submission.task_id == task_id,
            Submission.status.in_(["ON_TIME", "LATE"])
        )
    )
    submitted_ids = set(sub_res.scalars().all())
    missing_ids = [sid for sid in assigned_ids if sid not in submitted_ids]

    if not missing_ids:
        return []

    students_res = await db.execute(select(Student).where(Student.id.in_(missing_ids)))
    return list(students_res.scalars().all())


@router.get("", response_model=list[TaskSchema])
async def list_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    res = await db.execute(select(Task).order_by(Task.task_number.asc()))
    tasks = res.scalars().all()
    results = []

    is_member = current_user.role in ("committee_member", "member")

    assigned_task_ids = None
    if is_member and current_user.student_id:
        assign_res = await db.execute(
            select(TaskAssignment.task_id).where(TaskAssignment.student_id == current_user.student_id)
        )
        assigned_task_ids = set(assign_res.scalars().all())

    for t in tasks:
        # For members, if explicit assignments exist, filter out non-assigned tasks
        if is_member and assigned_task_ids is not None:
            task_assign_count = await db.execute(
                select(func.count(TaskAssignment.id)).where(TaskAssignment.task_id == t.id)
            )
            count = task_assign_count.scalar() or 0
            if count > 0 and t.id not in assigned_task_ids:
                continue

        sub_res = await db.execute(
            select(Submission).where(Submission.task_id == t.id)
        )
        submissions = sub_res.scalars().all()

        assign_res = await db.execute(
            select(func.count(TaskAssignment.id)).where(TaskAssignment.task_id == t.id)
        )
        assigned_count = assign_res.scalar() or 0

        # Authoritative rule: committee_member MUST NOT see max_score or score_rule
        results.append(TaskSchema(
            id=t.id,
            task_number=t.task_number,
            title=t.title,
            description=t.description,
            deadline=t.deadline,
            max_score=None if is_member else t.max_score,
            score_rule=None if is_member else t.score_rule,
            submission_count=sum(1 for s in submissions if s.status != "PENDING"),
            pending_count=sum(1 for s in submissions if s.status == "PENDING"),
            assigned_count=assigned_count
        ))
    return results


@router.post("", response_model=TaskSchema, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_head", "team_lead", "hr_admin"]))
):
    """
    Creates a new task with optional explicit student assignments.
    Social Media Committee Head responsibility.
    Follows fail-closed rule: empty assignments will not trigger reminders.
    """
    max_num_res = await db.execute(select(func.max(Task.task_number)))
    current_max = max_num_res.scalar() or 0
    next_task_num = current_max + 1

    task_id = f"task_{uuid.uuid4().hex[:12]}"
    new_task = Task(
        id=task_id,
        task_number=next_task_num,
        title=body.title.strip(),
        description=body.description or "",
        deadline=body.deadline,
        max_score=body.max_score,
        score_rule=body.score_rule or "Out of 10 points based on quality and punctuality",
        created_by_user_id=current_user.id,
        team_id=current_user.team_id,
    )
    db.add(new_task)

    # If students explicitly assigned, create assignments and pending submissions
    if body.assigned_student_ids:
        for sid in set(body.assigned_student_ids):
            db.add(TaskAssignment(
                id=f"ta_{uuid.uuid4().hex[:12]}",
                task_id=task_id,
                student_id=sid,
            ))
            db.add(Submission(
                id=f"sub_{uuid.uuid4().hex[:12]}",
                task_id=task_id,
                student_id=sid,
                status="PENDING",
            ))

    await db.commit()
    await db.refresh(new_task)

    return TaskSchema(
        id=new_task.id,
        task_number=new_task.task_number,
        title=new_task.title,
        description=new_task.description,
        deadline=new_task.deadline,
        max_score=new_task.max_score,
        score_rule=new_task.score_rule,
        submission_count=0,
        pending_count=len(body.assigned_student_ids),
        assigned_count=len(body.assigned_student_ids),
    )


@router.post("/{task_id}/assign")
async def assign_students_to_task(
    task_id: str,
    body: TaskAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_head", "team_lead", "hr_admin"]))
):
    """Explicitly assigns students to a task."""
    task_res = await db.execute(select(Task).where(Task.id == task_id))
    task = task_res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    added_count = 0
    for sid in set(body.student_ids):
        existing = await db.execute(
            select(TaskAssignment).where(
                TaskAssignment.task_id == task_id,
                TaskAssignment.student_id == sid
            )
        )
        if not existing.scalar_one_or_none():
            db.add(TaskAssignment(
                id=f"ta_{uuid.uuid4().hex[:12]}",
                task_id=task_id,
                student_id=sid,
            ))
            # Also ensure a pending submission exists
            sub_exist = await db.execute(
                select(Submission).where(
                    Submission.task_id == task_id,
                    Submission.student_id == sid
                )
            )
            if not sub_exist.scalar_one_or_none():
                db.add(Submission(
                    id=f"sub_{uuid.uuid4().hex[:12]}",
                    task_id=task_id,
                    student_id=sid,
                    status="PENDING",
                ))
            added_count += 1

    await db.commit()
    return {"status": "success", "task_id": task_id, "assigned_new": added_count}


@router.get("/{task_id}/scores", response_model=list[TaskScoreItemSchema])
async def list_task_scores_for_hr(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Score collection endpoint for HR and Leadership roles.
    Allows HR Members, HR Leaders, Regional HR Heads, and Committee Heads to read
    numerical task scores, grading status, and student metadata.
    Does NOT expose technical submission files or deliverable URLs.
    
    Authorization / Scoping:
    - region_hr_head / hr_admin: can collect scores across all committees.
    - committee_hr_leader / committee_hr_member: restricted to their assigned committee.
    - committee_head / team_lead: restricted to their assigned committee.
    - committee_member / member: strictly forbidden (HTTP 403).
    """
    # 1. Committee members cannot view internal task scores
    if current_user.role in ("committee_member", "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: score collection is restricted to HR and leadership roles."
        )

    # 2. Verify task exists
    task_res = await db.execute(select(Task).where(Task.id == task_id))
    task = task_res.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found."
        )

    # 3. Verify committee scope for committee-scoped roles
    is_scoped = current_user.role in ("committee_hr_leader", "committee_hr_member", "committee_head", "team_lead")
    if is_scoped and task.team_id and current_user.team_id and task.team_id != current_user.team_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: this task belongs to a different committee."
        )

    # 4. Query submissions
    query = (
        select(Submission, Student, Task)
        .join(Student, Submission.student_id == Student.id)
        .join(Task, Submission.task_id == Task.id)
        .where(Submission.task_id == task_id)
    )

    if is_scoped and current_user.team_id:
        query = query.where(Student.team_id == current_user.team_id)

    res = await db.execute(query)
    records = res.all()

    results = []
    for sub, std, t in records:
        results.append(TaskScoreItemSchema(
            submission_id=sub.id,
            task_id=sub.task_id,
            task_title=t.title,
            student_id=std.id,
            student_name=std.full_name,
            arabic_name=std.arabic_name,
            status=sub.status,
            score=sub.score,
            technical_score=sub.technical_score or sub.score,
            reviewer_notes=sub.reviewer_notes,
            submitted_at=sub.submitted_at,
            reviewed_at=sub.reviewed_at,
            graded_by_user_id=sub.graded_by_user_id
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

    is_member = current_user.role in ("committee_member", "member")

    if current_user.role in ("committee_head", "team_lead"):
        query = query.where(Student.team_id == current_user.team_id)
    elif is_member:
        if not current_user.student_id:
            return []
        query = query.where(Submission.student_id == current_user.student_id)

    res = await db.execute(query)
    records = res.all()
    results = []
    for sub, std, t in records:
        if is_member and sub.student_id != current_user.student_id:
            continue
        results.append(SubmissionSchema(
            id=sub.id,
            task_id=sub.task_id,
            task_title=t.title,
            student_id=std.id,
            student_name=std.full_name,
            submitted_at=sub.submitted_at,
            status=sub.status,
            score=None if is_member else sub.score,
            technical_score=None if is_member else (sub.technical_score or sub.score),
            file_url=sub.file_url,
            reviewer_notes=None if is_member else sub.reviewer_notes,
            graded_by_user_id=None if is_member else sub.graded_by_user_id
        ))
    return results


@router.get("/submissions/{submission_id}", response_model=SubmissionSchema)
async def get_submission(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves a single task submission with strict IDOR and confidentiality enforcement:
    - committee_member / member: can only retrieve their own submission, with scores redacted server-side.
    - committee_head / team_lead: can retrieve submissions for their team (with scores).
    - HR roles: strictly forbidden (403).
    """
    if current_user.role in ("region_hr_head", "committee_hr_leader", "committee_hr_member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: HR roles do not have permission to view technical task submissions."
        )

    res = await db.execute(
        select(Submission, Student, Task)
        .join(Student, Submission.student_id == Student.id)
        .join(Task, Submission.task_id == Task.id)
        .where(Submission.id == submission_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")

    sub, std, t = row
    is_member = current_user.role in ("committee_member", "member")

    if is_member:
        if sub.student_id != current_user.student_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you cannot access another member's submission."
            )
        return SubmissionSchema(
            id=sub.id,
            task_id=sub.task_id,
            task_title=t.title,
            student_id=std.id,
            student_name=std.full_name,
            submitted_at=sub.submitted_at,
            status=sub.status,
            score=None,
            technical_score=None,
            file_url=sub.file_url,
            reviewer_notes=None,
            graded_by_user_id=None
        )

    if current_user.role in ("committee_head", "team_lead"):
        if std.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: this student belongs to a different committee."
            )

    return SubmissionSchema(
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


@router.get("/submissions/{submission_id}/score", response_model=TaskScoreItemSchema)
async def get_submission_score_for_hr(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves score and grading status for a single submission.
    Provides safe score collection for HR without exposing technical submission deliverables.
    """
    if current_user.role in ("committee_member", "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: score collection is restricted to HR and leadership roles."
        )

    res = await db.execute(
        select(Submission, Student, Task)
        .join(Student, Submission.student_id == Student.id)
        .join(Task, Submission.task_id == Task.id)
        .where(Submission.id == submission_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Submission with ID '{submission_id}' not found."
        )

    sub, std, task = row
    is_scoped = current_user.role in ("committee_hr_leader", "committee_hr_member", "committee_head", "team_lead")

    if is_scoped and current_user.team_id:
        if std.team_id != current_user.team_id or (task.team_id and task.team_id != current_user.team_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: this submission belongs to a different committee."
            )

    return TaskScoreItemSchema(
        submission_id=sub.id,
        task_id=sub.task_id,
        task_title=task.title,
        student_id=std.id,
        student_name=std.full_name,
        arabic_name=std.arabic_name,
        status=sub.status,
        score=sub.score,
        technical_score=sub.technical_score or sub.score,
        reviewer_notes=sub.reviewer_notes,
        submitted_at=sub.submitted_at,
        reviewed_at=sub.reviewed_at,
        graded_by_user_id=sub.graded_by_user_id
    )


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

    if body.score > task.max_score:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Score {body.score} exceeds maximum score of {task.max_score} for this task."
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
    body: Optional[TaskSubmitRequest] = None,
    file_url: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_member", "member"]))
):
    """Allows a committee member student to submit work for a task."""
    resolved_file_url = (body.file_url if body and body.file_url else file_url)
    if not resolved_file_url:
        raise HTTPException(status_code=400, detail="file_url is required")

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
    deadline = task.deadline
    if deadline is not None:
        if deadline.tzinfo is None and now.tzinfo is not None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        elif deadline.tzinfo is not None and now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        status_str = "LATE" if now > deadline else "ON_TIME"
    else:
        status_str = "ON_TIME"

    import uuid
    if not submission:
        submission = Submission(
            id=f"sub_{uuid.uuid4().hex[:12]}",
            task_id=task_id,
            student_id=current_user.student_id,
            submitted_at=now,
            status=status_str,
            file_url=resolved_file_url,
        )
        db.add(submission)
    else:
        submission.submitted_at = now
        submission.status = status_str
        submission.file_url = resolved_file_url

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
        score=None,
        technical_score=None,
        file_url=submission.file_url,
        reviewer_notes=None,
        graded_by_user_id=None
    )
