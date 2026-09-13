import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_interaction_score_is_separate_and_bounded(setup_data, auth_headers):
    headers = auth_headers(setup_data["admin"], "hr_admin", None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.put(
            f"/api/students/{setup_data['st_a']}/behavior-score",
            json={
                "student_id": setup_data["st_a"],
                "group_interaction": 4.0,
                "social_media": 4.0,
                "hierarchy_rules": 4.0,
                "polite_conduct": 7.0,
                "interaction": 3.5,
            },
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["interaction_score"] == 3.5
        assert response.json()["total_behavior_score"] == 19.0
        assert response.json()["total_score"] is None

        invalid = await client.put(
            f"/api/students/{setup_data['st_a']}/behavior-score",
            json={
                "student_id": setup_data["st_a"],
                "group_interaction": 4.0,
                "social_media": 4.0,
                "hierarchy_rules": 4.0,
                "polite_conduct": 7.0,
                "interaction": 5.1,
            },
            headers=headers,
        )
        assert invalid.status_code == 422