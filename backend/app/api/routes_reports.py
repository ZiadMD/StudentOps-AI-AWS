"""
Committee Reports & Regional Oversight Endpoints.
Workflow: HR Leader reports to HR Region Head; HR Head provides high-level oversight.
"""
from typing import Optional, Any
import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.entities import (
    CommitteeReport, Team, User, Student, Meeting, AttendanceRecord,
    Task, Submission, ScoreRecord, MemberFollowupStatus, MemberFeedback, utcnow
)
from app.models.schemas import CommitteeReportCreateRequest, CommitteeReportResponse

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/committee/summary")
async def get_committee_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_leader", "region_hr_head", "hr_admin"]))
):
    """
    Computes real-time executive summary for the Social Media Committee.
    Used by HR Leader to review committee health and prepare upward reports to HR Head.
    """
    if current_user.role == "committee_hr_leader" and not current_user.team_id:
        raise HTTPException(status_code=403, detail="A committee team is required for this report")
    team_id = current_user.team_id or "team_media"

    # Team details
    t_res = await db.execute(select(Team).where(Team.id == team_id))
    team = t_res.scalar_one_or_none()
    team_name = team.name if team else "Social Media Committee"

    # 1. Total Members
    std_res = await db.execute(select(func.count(Student.id)).where(Student.team_id == team_id))
    total_members = std_res.scalar() or 0

    # 2. Meetings & Attendance Ratio
    meet_res = await db.execute(select(Meeting.id).where(Meeting.team_id == team_id))
    meet_ids = list(meet_res.scalars().all())

    total_att_records = 0
    present_att_records = 0
    if meet_ids:
        att_res = await db.execute(
            select(AttendanceRecord).where(AttendanceRecord.meeting_id.in_(meet_ids))
        )
        records = att_res.scalars().all()
        total_att_records = len(records)
        present_att_records = sum(1 for r in records if r.status in ("PRESENT", "LATE"))

    att_rate = round((present_att_records / max(total_att_records, 1)) * 100.0, 1)

    # 3. Tasks & Submissions
    task_res = await db.execute(select(Task.id).where(Task.team_id == team_id))
    task_ids = list(task_res.scalars().all())

    total_subs = 0
    completed_subs = 0
    if task_ids:
        sub_res = await db.execute(
            select(Submission).where(Submission.task_id.in_(task_ids))
        )
        subs = sub_res.scalars().all()
        total_subs = len(subs)
        completed_subs = sum(1 for s in subs if s.status in ("ON_TIME", "LATE"))

    submission_rate = round((completed_subs / max(total_subs, 1)) * 100.0, 1)

    # 4. Open Flags (Absenteeism / Overdue tasks)
    flag_res = await db.execute(
        select(func.count(MemberFollowupStatus.id))
        .join(Student, MemberFollowupStatus.student_id == Student.id)
        .where(
            Student.team_id == team_id,
            MemberFollowupStatus.status.in_(["PENDING", "ESCALATED"])
        )
    )
    open_flags = flag_res.scalar() or 0

    # 5. Member Feedback count
    fb_res = await db.execute(
        select(func.count(MemberFeedback.id))
        .join(Student, MemberFeedback.student_id == Student.id)
        .where(Student.team_id == team_id)
    )
    feedback_count = fb_res.scalar() or 0

    # 6. Bonus Points awarded
    bonus_res = await db.execute(
        select(func.sum(ScoreRecord.points))
        .join(Student, ScoreRecord.student_id == Student.id)
        .where(ScoreRecord.category == "BONUS", Student.team_id == team_id)
    )
    total_bonuses = bonus_res.scalar() or 0.0

    return {
        "team_id": team_id,
        "team_name": team_name,
        "total_members": total_members,
        "total_sessions": len(meet_ids),
        "attendance_rate_percent": att_rate,
        "task_count": len(task_ids),
        "task_submission_rate_percent": submission_rate,
        "open_followup_flags": open_flags,
        "feedback_submissions_count": feedback_count,
        "total_bonuses_awarded": float(total_bonuses),
        "reported_by": current_user.full_name,
        "generated_at": utcnow().isoformat()
    }


@router.post("/submit-to-head", response_model=CommitteeReportResponse, status_code=status.HTTP_201_CREATED)
async def submit_report_to_head(
    body: CommitteeReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_leader", "hr_admin"]))
):
    """
    Submits a formal committee report upward to the HR Region Head.
    HR Leader responsibility.
    """
    team_id = current_user.team_id or "team_media"

    # Generate current metrics
    summary = await get_committee_summary(db=db, current_user=current_user)

    report_id = f"rep_{uuid.uuid4().hex[:12]}"
    report = CommitteeReport(
        id=report_id,
        team_id=team_id,
        submitted_by_user_id=current_user.id,
        report_title=body.report_title.strip(),
        metrics_summary=json.dumps(summary),
        notes=body.notes or "",
        submitted_at=utcnow()
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    t_res = await db.execute(select(Team).where(Team.id == team_id))
    team = t_res.scalar_one_or_none()

    return CommitteeReportResponse(
        id=report.id,
        team_id=report.team_id,
        team_name=team.name if team else "Social Media Committee",
        submitted_by_name=current_user.full_name,
        report_title=report.report_title,
        metrics_summary=summary,
        notes=report.notes or "",
        submitted_at=report.submitted_at,
        acknowledged_at=report.acknowledged_at
    )


@router.get("", response_model=list[CommitteeReportResponse])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["region_hr_head", "committee_hr_leader", "hr_admin"]))
):
    """
    Lists submitted reports.
    HR Head views regional committee reports; HR Leader views own submitted reports.
    """
    query = select(CommitteeReport, Team, User).outerjoin(
        Team, CommitteeReport.team_id == Team.id
    ).outerjoin(
        User, CommitteeReport.submitted_by_user_id == User.id
    ).order_by(CommitteeReport.submitted_at.desc())

    if current_user.role == "committee_hr_leader" and current_user.team_id:
        query = query.where(CommitteeReport.team_id == current_user.team_id)

    res = await db.execute(query)
    rows = res.all()

    return [
        CommitteeReportResponse(
            id=rep.id,
            team_id=rep.team_id,
            team_name=team.name if team else "Social Media Committee",
            submitted_by_name=submitter.full_name if submitter else "HR Leader",
            report_title=rep.report_title,
            metrics_summary=json.loads(rep.metrics_summary) if rep.metrics_summary else {},
            notes=rep.notes or "",
            submitted_at=rep.submitted_at,
            acknowledged_at=rep.acknowledged_at
        )
        for rep, team, submitter in rows
    ]


@router.post("/{report_id}/acknowledge", response_model=CommitteeReportResponse)
async def acknowledge_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["region_hr_head", "hr_admin"]))
):
    """
    HR Head acknowledges a submitted committee report. (ISSUE-22)
    HR Leaders cannot acknowledge their own reports.
    """
    query = select(CommitteeReport, Team, User).outerjoin(
        Team, CommitteeReport.team_id == Team.id
    ).outerjoin(
        User, CommitteeReport.submitted_by_user_id == User.id
    ).where(CommitteeReport.id == report_id)
    
    res = await db.execute(query)
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
        
    report, team, submitter = row
    
    report.acknowledged_at = utcnow()
    await db.commit()
    await db.refresh(report)
    
    return CommitteeReportResponse(
        id=report.id,
        team_id=report.team_id,
        team_name=team.name if team else "Social Media Committee",
        submitted_by_name=submitter.full_name if submitter else "HR Leader",
        report_title=report.report_title,
        metrics_summary=json.loads(report.metrics_summary) if report.metrics_summary else {},
        notes=report.notes or "",
        submitted_at=report.submitted_at,
        acknowledged_at=report.acknowledged_at
    )
