from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, verify_student_access, require_roles
from app.models.entities import Student, User, ScoreRecord, utcnow
from app.models.schemas import (
    StudentResponse,
    StudentScoreSummary,
    BehaviorScoreUpdate,
    AssignCohortRequest,
    StudentPhoneUpdate,
    BonusAwardRequest,
)
from app.services.scoring_service import ScoringService
from app.agent.tools import escape_like

router = APIRouter(prefix="/students", tags=["Students"])


@router.get("", response_model=list[StudentResponse])
async def list_students(
    role: Optional[str] = None,
    status_filter: Optional[str] = None,
    assigned_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lists student records with automatic organizational scoping:
    - region_hr_head / hr_admin: sees all students across all teams.
    - committee_head / committee_hr_leader / team_lead: sees only members belonging to their assigned team_id.
    - committee_hr_member: sees students assigned to them or in their committee.
    - committee_member / member: sees only their own student profile.
    """
    query = select(Student)

    if current_user.role in ("committee_head", "committee_hr_leader", "team_lead"):
        query = query.where(Student.team_id == current_user.team_id)
    elif current_user.role == "committee_hr_member":
        if assigned_only:
            query = query.where(Student.assigned_hr_id == current_user.id)
        else:
            query = query.where(
                (Student.assigned_hr_id == current_user.id) |
                (Student.team_id == current_user.team_id)
            )
    elif current_user.role in ("committee_member", "member"):
        query = query.where(Student.id == current_user.student_id)

    if role:
        query = query.where(Student.role.ilike(f"%{escape_like(role.strip())}%"))
    if status_filter:
        query = query.where(Student.status == status_filter.upper())

    res = await db.execute(query)
    return res.scalars().all()


@router.get("/scoreboard/all", response_model=list[StudentScoreSummary])
async def get_all_scoreboards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves scoreboards with scoping:
    - region_hr_head / hr_admin: full ground-truth scoreboard.
    - committee_head / committee_hr_leader / team_lead: scoreboard filtered to students in their team.
    - committee_hr_member: scoreboard for assigned cohort or committee.
    - committee_member: strictly forbidden (scores are confidential).
    - member (legacy): personal scorecard summary.
    """
    if current_user.role == "committee_member":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Scores are confidential and not visible to committee members."
        )

    all_summaries = await ScoringService.get_all_summaries(db)

    if current_user.role in ("region_hr_head", "hr_admin"):
        return all_summaries
    elif current_user.role in ("committee_head", "committee_hr_leader", "team_lead"):
        if not current_user.team_id:
            return []
        team_res = await db.execute(
            select(Student.id).where(Student.team_id == current_user.team_id)
        )
        team_student_ids = set(team_res.scalars().all())
        return [s for s in all_summaries if s.student_id in team_student_ids]
    elif current_user.role == "committee_hr_member":
        cohort_res = await db.execute(
            select(Student.id).where(
                (Student.assigned_hr_id == current_user.id) |
                ((Student.team_id == current_user.team_id) & (Student.assigned_hr_id.is_(None)))
            )
        )
        cohort_ids = set(cohort_res.scalars().all())
        return [s for s in all_summaries if s.student_id in cohort_ids]
    else:  # legacy member
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
    if current_user.role == "committee_member":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Scores are confidential and not visible to committee members."
        )

    await verify_student_access(student_id, current_user, db)
    summary = await ScoringService.get_student_score_summary(student_id, db)
    if not summary:
        raise HTTPException(status_code=404, detail="Student not found or no score available")
    return summary


@router.put("/{student_id}/behavior-score", response_model=StudentScoreSummary)
async def update_behavior_score(
    student_id: str,
    body: BehaviorScoreUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_member", "hr_admin"]))
):
    """
    Submits or updates behavior scores (/23) for a student.
    Committee Head is strictly read-only and cannot call this endpoint.
    Committee HR Member can only grade their assigned cohort or committee students.
    """
    student = await verify_student_access(student_id, current_user, db)

    import uuid
    categories = [
        ("GROUP_INTERACTION", body.group_interaction, 5.0),
        ("SOCIAL_MEDIA", body.social_media, 5.0),
        ("HIERARCHY_RULES", body.hierarchy_rules, 5.0),
        ("POLITE_CONDUCT", body.polite_conduct, 8.0),
    ]

    for cat_name, points, max_pts in categories:
        # Check existing record
        query = select(ScoreRecord).where(
            ScoreRecord.student_id == student_id,
            ScoreRecord.category == cat_name
        )
        if body.month:
            query = query.where(ScoreRecord.month == body.month)
        
        res = await db.execute(query)
        record = res.scalar_one_or_none()

        if record:
            record.points = points
            record.notes = body.notes or record.notes
            record.graded_by_user_id = current_user.id
            record.updated_by = current_user.full_name
        else:
            record = ScoreRecord(
                id=f"score_{uuid.uuid4().hex[:12]}",
                student_id=student_id,
                category=cat_name,
                points=points,
                max_points=max_pts,
                month=body.month,
                graded_by_user_id=current_user.id,
                notes=body.notes or "",
                updated_by=current_user.full_name,
            )
            db.add(record)

    await db.commit()
    summary = await ScoringService.get_student_score_summary(student_id, db)
    return summary


@router.post("/assign-cohort")
async def assign_student_cohort(
    body: AssignCohortRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_leader", "region_hr_head", "hr_admin"]))
):
    """
    Assigns a cohort of students to a specific HR Member.
    Managed by Committee HR Leader or Regional Head.
    """
    # Verify HR member exists and has committee_hr_member role
    hr_res = await db.execute(select(User).where(User.id == body.hr_member_id))
    hr_user = hr_res.scalar_one_or_none()
    if not hr_user:
        raise HTTPException(status_code=404, detail="HR member user not found")

    # If caller is committee_hr_leader, ensure HR member and students belong to their committee
    if current_user.role == "committee_hr_leader":
        if hr_user.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot assign HR members outside your committee."
            )

    # Fetch and update students
    res = await db.execute(select(Student).where(Student.id.in_(body.student_ids)))
    students = res.scalars().all()
    if not students:
        raise HTTPException(status_code=404, detail="No matching students found")

    for s in students:
        if current_user.role == "committee_hr_leader" and s.team_id != current_user.team_id:
            continue
        s.assigned_hr_id = body.hr_member_id

    await db.commit()
    return {"status": "success", "assigned_count": len(students), "hr_member_id": body.hr_member_id}


@router.patch("/{student_id}/phone", response_model=StudentResponse)
async def update_student_phone(
    student_id: str,
    body: StudentPhoneUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["region_hr_head", "committee_hr_leader", "hr_admin"]))
):
    """
    Updates a student's WhatsApp contact phone number.
    Restricted to Region HR Head, Committee HR Leader, and Organization Admin.
    """
    student = await verify_student_access(student_id, current_user, db)
    student.phone = body.phone.strip()
    await db.commit()
    await db.refresh(student)
    return student


@router.post("/{student_id}/bonus", response_model=StudentScoreSummary)
async def award_student_bonus(
    student_id: str,
    body: BonusAwardRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_leader", "hr_admin"]))
):
    """
    Awards bonus points to a member.
    Authoritative workflow: HR Leader can give bonuses to members.
    Committee Head and Members are strictly forbidden.
    """
    student = await verify_student_access(student_id, current_user, db)

    import uuid
    query = select(ScoreRecord).where(
        ScoreRecord.student_id == student_id,
        ScoreRecord.category == "BONUS"
    )
    res = await db.execute(query)
    record = res.scalar_one_or_none()

    if record:
        record.points = record.points + body.points
        record.notes = f"{record.notes} | {body.notes}" if record.notes and body.notes else (body.notes or record.notes)
        record.graded_by_user_id = current_user.id
        record.updated_by = current_user.full_name
    else:
        record = ScoreRecord(
            id=f"score_bonus_{uuid.uuid4().hex[:10]}",
            student_id=student_id,
            category="BONUS",
            points=body.points,
            max_points=10.0,
            graded_by_user_id=current_user.id,
            notes=body.notes or "Bonus awarded by HR Leader",
            updated_by=current_user.full_name,
        )
        db.add(record)

    await db.commit()
    summary = await ScoringService.get_student_score_summary(student_id, db)
    return summary

