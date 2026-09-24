import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.entities import TaskAssignment


@pytest.mark.asyncio
async def test_team_scoped_task_list_excludes_other_teams_and_unassigned_users(setup_data, auth_headers):
    team_a_headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    unassigned_headers = auth_headers(setup_data["head_unassigned"], "committee_head", None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        team_a_response = await client.get("/api/tasks", headers=team_a_headers)
        unassigned_response = await client.get("/api/tasks", headers=unassigned_headers)

    assert team_a_response.status_code == 200
    assert {task["id"] for task in team_a_response.json()} == {setup_data["tk_a"]}
    assert unassigned_response.status_code == 200
    assert unassigned_response.json() == []


@pytest.mark.asyncio
async def test_task_assignment_rejects_students_from_another_team(setup_data, auth_headers):
    headers = auth_headers(setup_data["head_a"], "committee_head", setup_data["team_a"])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/tasks/{setup_data['tk_a']}/assign",
            json={"student_ids": [setup_data["st_b"]]},
            headers=headers,
        )

    assert response.status_code == 403
    async with AsyncSessionLocal() as db:
        assignment = await db.execute(
            select(TaskAssignment).where(
                TaskAssignment.task_id == setup_data["tk_a"],
                TaskAssignment.student_id == setup_data["st_b"],
            )
        )
        assert assignment.scalar_one_or_none() is None