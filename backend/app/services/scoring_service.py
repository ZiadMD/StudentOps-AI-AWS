"""
Deterministic 8.xlsx Scoring and Evaluation Service.
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.entities import Student, AttendanceRecord, Submission, ScoreRecord, Task
from app.models.schemas import StudentScoreSummary


class ScoringService:
    """Calculates student scorecards and summary board strictly adhering to 8.xlsx standards."""

    @staticmethod
    async def get_student_score_summary(student_id: str, db: AsyncSession) -> Optional[StudentScoreSummary]:
        # 1. Fetch Student
        res = await db.execute(select(Student).where(Student.id == student_id))
        student = res.scalar_one_or_none()
        if not student:
            return None

        # 2. Attendance Counts
        att_res = await db.execute(
            select(AttendanceRecord).where(AttendanceRecord.student_id == student_id)
        )
        attendance_records = att_res.scalars().all()
        
        on_time_att = sum(1 for a in attendance_records if a.status == "PRESENT")
        late_att = sum(1 for a in attendance_records if a.status == "LATE")
        absence = sum(1 for a in attendance_records if a.status.endswith("ABSENT"))
        excused = sum(1 for a in attendance_records if a.status.startswith("EXCUSED"))

        # 3. Task Submissions
        sub_res = await db.execute(
            select(Submission).where(Submission.student_id == student_id)
        )
        submissions = sub_res.scalars().all()
        
        on_time_tasks = sum(1 for s in submissions if s.status == "ON_TIME")
        late_tasks = sum(1 for s in submissions if s.status == "LATE")
        pending_tasks = sum(1 for s in submissions if s.status == "PENDING")
        
        scored_submissions = [s.score for s in submissions if s.score is not None]
        avg_quality = (sum(scored_submissions) / len(scored_submissions)) if scored_submissions else 0.0

        # 4. Behavior Scores (/23)
        score_rec_res = await db.execute(
            select(ScoreRecord).where(ScoreRecord.student_id == student_id)
        )
        score_records = score_rec_res.scalars().all()
        
        scores_by_cat = {r.category: r.points for r in score_records}
        group_int = scores_by_cat.get("GROUP_INTERACTION", 5.0)
        social_med = scores_by_cat.get("SOCIAL_MEDIA", 5.0)
        hierarchy = scores_by_cat.get("HIERARCHY_RULES", 5.0)
        polite = scores_by_cat.get("POLITE_CONDUCT", 8.0)
        total_behavior = group_int + social_med + hierarchy + polite

        # Overall qualitative rating
        if avg_quality >= 8.5 and total_behavior >= 20 and absence == 0:
            rating = "Outstanding"
        elif avg_quality >= 6.0 and total_behavior >= 15 and absence <= 2:
            rating = "Good"
        else:
            rating = "Needs Improvement"

        return StudentScoreSummary(
            student_id=student.id,
            student_name=student.full_name,
            arabic_name=student.arabic_name,
            on_time_attendance_count=on_time_att,
            late_attendance_count=late_att,
            absence_count=absence,
            excused_absence_count=excused,
            on_time_task_count=on_time_tasks,
            late_task_count=late_tasks,
            pending_task_count=pending_tasks,
            average_task_quality=round(avg_quality, 1),
            group_interaction_score=group_int,
            social_media_score=social_med,
            hierarchy_rules_score=hierarchy,
            polite_conduct_score=polite,
            total_behavior_score=total_behavior,
            overall_rating=rating
        )

    @staticmethod
    async def get_all_summaries(db: AsyncSession) -> list[StudentScoreSummary]:
        res = await db.execute(select(Student))
        students = res.scalars().all()
        summaries = []
        for s in students:
            summary = await ScoringService.get_student_score_summary(s.id, db)
            if summary:
                summaries.append(summary)
        return summaries
