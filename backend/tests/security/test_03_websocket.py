import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token



def test_websocket_authentication(setup_data):
    client = TestClient(app)
    
    # 1. No authentication
    with pytest.raises(Exception) as exc:
        with client.websocket_connect("/api/whatsapp/ws"):
            pass
    assert exc.value.code == 1008
    
    # 2. Invalid Token
    with pytest.raises(Exception) as exc:
        with client.websocket_connect("/api/whatsapp/ws?token=invalid"):
            pass
    assert exc.value.code == 1008
    
    # 3. Missing User
    missing_token = create_access_token({"sub": "non_existent_user", "role": "committee_hr_member", "team_id": setup_data["team_a"]})
    with pytest.raises(Exception) as exc:
        with client.websocket_connect(f"/api/whatsapp/ws?token={missing_token}"):
            pass
    assert exc.value.code == 1008
    
    # 4. Inactive User
    inactive_token = create_access_token({"sub": setup_data["inactive_hr"], "role": "committee_hr_member", "team_id": setup_data["team_a"]})
    with pytest.raises(Exception) as exc:
        with client.websocket_connect(f"/api/whatsapp/ws?token={inactive_token}"):
            pass
    assert exc.value.code == 1008

    # 5. Valid HR token - Should connect
    valid_token = create_access_token({"sub": setup_data["hr_a"], "role": "committee_hr_member", "team_id": setup_data["team_a"]})
    with client.websocket_connect(f"/api/whatsapp/ws?token={valid_token}") as ws:
        ws.send_text("ping")
        data = ws.receive_text()
        assert data == "pong"
        
    # 6. Student token - Unauthorized HR Role
    student_token = create_access_token({"sub": setup_data["st_a"], "role": "Member", "team_id": setup_data["team_a"]})
    with pytest.raises(Exception) as exc:
        with client.websocket_connect(f"/api/whatsapp/ws?token={student_token}"):
            pass
    assert exc.value.code == 1008
