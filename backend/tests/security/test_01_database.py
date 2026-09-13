import pytest
from app.models.entities import Student
from sqlalchemy.exc import IntegrityError

@pytest.mark.asyncio
async def test_database_foreign_keys(setup_data):
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        # PRAGMA foreign_keys should be enforced
        invalid_student = Student(id="st_invalid", email="invalid@test.com", full_name="Invalid", phone="+999", team_id="INVALID_TEAM", role="Member", arabic_name="A")
        db.add(invalid_student)
        try:
            await db.commit()
            assert False, "Database allowed insertion with invalid foreign key!"
        except IntegrityError:
            await db.rollback()
            assert True

@pytest.mark.asyncio
async def test_valid_foreign_keys(setup_data):
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        valid_student = Student(id="st_valid", email="valid@test.com", full_name="Valid", phone="+998", team_id="team_a", role="Member", arabic_name="A", student_code="333")
        db.add(valid_student)
        await db.commit()
        assert valid_student.id is not None
