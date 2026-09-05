import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt
from starlette.requests import Request

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_JWKS_URL", "https://example.supabase.co/auth/v1/.well-known/jwks.json")
os.environ.setdefault("SUPABASE_ISSUER", "https://example.supabase.co/auth/v1")
os.environ.setdefault("SUPABASE_AUDIENCE", "authenticated")
os.environ.setdefault("SUPABASE_JWT_SECRET", "secret")
os.environ.setdefault("TURNSTILE_SECRET_KEY", "test-turnstile-secret")
os.environ.setdefault("ALLOWED_ORIGINS", "[]")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from api import agent, tasks
from core import security


class FakeQuery:
    def __init__(self, data=None):
        self.data = data or []
        self.filters = []
        self.updated = None
        self.single_result = False

    def select(self, *_columns):
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def range(self, _start, _end):
        return self

    def single(self):
        self.single_result = True
        return self

    def maybe_single(self):
        self.single_result = True
        return self

    def update(self, values):
        self.updated = values
        return self

    def execute(self):
        data = self.data[0] if self.single_result and self.data else self.data
        return SimpleNamespace(data=data)


class FakeClient:
    def __init__(self, query_data=None):
        self.query_data = query_data or []
        self.queries = []

    def table(self, _name):
        query = FakeQuery(self.query_data)
        self.queries.append(query)
        return query


def credentials(token="header.payload.signature"):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def request():
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
        "scheme": "http",
    })


def test_invalid_signature_is_rejected(monkeypatch):
    monkeypatch.setattr(
        security,
        "_decode_supabase_token",
        lambda _token: (_ for _ in ()).throw(ValueError("bad signature")),
    )

    with pytest.raises(HTTPException) as error:
        security.verify_token(request(), credentials())

    assert error.value.status_code == 401


def test_missing_token_is_rejected():
    with pytest.raises(HTTPException) as error:
        security.verify_token(request(), None)

    assert error.value.status_code == 401


@pytest.mark.parametrize("invalid_token", ["null", "none", "undefined", "  NULL  "])
def test_javascript_token_sentinels_are_rejected(invalid_token):
    with pytest.raises(HTTPException) as error:
        security.verify_token(request(), credentials(invalid_token))

    assert error.value.status_code == 401


def test_missing_required_claim_is_rejected(monkeypatch):
    security.settings.supabase_jwt_secret = "secret"
    token = jwt.encode(
        {"sub": "user-a", "exp": 4_000_000_000, "aud": "authenticated"},
        "secret",
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as error:
        security.verify_token(request(), credentials(token))

    assert error.value.status_code == 401


def test_profile_is_authoritative_for_role_and_tenant(monkeypatch):
    client = FakeClient([{"id": "user-a", "organization_id": "org-a", "role": "member"}])
    monkeypatch.setattr(
        security.jwt,
        "get_unverified_header",
        lambda _token: {"alg": "HS256"},
    )
    monkeypatch.setattr(
        security.jwt,
        "decode",
        lambda *_args, **_kwargs: {
            "sub": "user-a",
            "aud": security.settings.supabase_audience,
            "exp": 4_000_000_000,
            "role": "hr_leader",
            "organization_id": "org-b",
        },
    )
    monkeypatch.setattr(security, "get_tenant_client", lambda _token: client)

    principal = security.verify_token(request(), credentials())

    assert principal.user_id == "user-a"
    assert principal.role == "member"
    assert principal.organization_id == "org-a"
    assert ("id", "user-a") in client.queries[0].filters


def test_profile_role_is_preserved_exactly():
    assert security.TokenPayload(
        user_id="user-a", role="hr", organization_id="org-a"
    ).role == "hr"


def test_require_role_uses_request_state_principal():
    dependency = security.require_role([security.UserRole.ADMIN])
    principal = security.TokenPayload(
        user_id="user-a",
        role=security.UserRole.ADMIN,
        organization_id="org-a",
    )
    state_request = request()
    state_request.state.principal = principal

    assert dependency(state_request, principal) == principal

    state_request.state.principal = security.TokenPayload(
        user_id="user-a",
        role=security.UserRole.MEMBER,
        organization_id="org-a",
    )
    with pytest.raises(HTTPException) as error:
        dependency(state_request, principal)
    assert error.value.status_code == 403


def test_task_enumeration_is_scoped_to_principal_tenant(monkeypatch):
    client = FakeClient([{"id": "task-a"}])
    monkeypatch.setattr(tasks, "get_access_token", lambda _request: "token-a")
    monkeypatch.setattr(tasks, "get_tenant_client", lambda _token: client)

    result = tasks.get_organization_tasks(
        request(),
        security.TokenPayload(user_id="user-a", role="member", organization_id="org-a"),
        page=1,
        page_size=25,
    )

    assert result["tasks"] == [{"id": "task-a"}]
    assert ("organization_id", "org-a") in client.queries[0].filters


def test_approval_update_is_scoped_to_principal_tenant(monkeypatch):
    client = FakeClient([{"tool_name": "safe_tool", "payload": {}}])
    monkeypatch.setattr(agent, "get_access_token", lambda _request: "token-a")
    monkeypatch.setattr(agent, "get_tenant_client", lambda _token: client)
    monkeypatch.setattr(agent.ToolRegistry, "validate_and_execute", lambda *_args: {"ok": True})
    monkeypatch.setattr(agent, "log_audit_event", lambda *_args, **_kwargs: None)

    request = Request({
        "type": "http",
        "method": "POST",
        "path": "/api/agent/approvals/approval-b/approve",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
        "scheme": "http",
    })
    request.state.request_id = "request-a"
    result = agent.approve_agent_action(
        request,
        "approval-b",
        security.TokenPayload(user_id="user-a", role="hr_leader", organization_id="org-a"),
    )

    assert result["status"] == "success"
    assert ("organization_id", "org-a") in client.queries[0].filters
    assert ("organization_id", "org-a") in client.queries[1].filters
