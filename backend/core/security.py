import hashlib
import logging
from typing import Any, List, Optional

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwk, jwt
from jwt.exceptions import PyJWTError
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from core.config import get_settings
from core.database import get_tenant_client

settings = get_settings()
security = HTTPBearer(auto_error=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    user_id: str = Field(min_length=1)
    role: str = Field(min_length=1)
    organization_id: str = Field(min_length=1)


class UserRole:
    ADMIN = "admin"
    HR = "hr"
    HR_LEADER = "hr_leader"
    HR_MEMBER = "hr_member"
    REGION_HR = "region_hr"
    MEMBER = "member"


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _extract_token(
    credentials: Optional[HTTPAuthorizationCredentials],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ValueError("missing bearer credentials")

    token = credentials.credentials.strip()
    if (
        not token
        or token.lower() in {"null", "none", "undefined"}
        or any(character.isspace() for character in token)
    ):
        raise ValueError("malformed bearer credentials")
    return token


def _decode_supabase_token(token: str) -> dict[str, Any]:
    secret = settings.supabase_jwt_secret
    if not secret:
        raise ValueError("Supabase JWT secret is not configured")

    header = jwt.get_unverified_header(token)
    if header.get("alg") != "HS256":
        raise ValueError("unsupported JWT algorithm")

    audience = settings.supabase_audience or "authenticated"
    payload = jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        options={"verify_aud": False},
    )

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise ValueError("missing JWT subject")
    if payload.get("aud") != audience:
        raise ValueError("unexpected JWT audience")
    return payload


def _resolve_principal(token: str, user_id: str) -> TokenPayload:
    client = get_tenant_client(token)
    response = (
        client.table("profiles")
        .select("id, role, organization_id")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    profile = response.data
    if not isinstance(profile, dict):
        raise ValueError("authoritative profile was not found")

    try:
        return TokenPayload(
            user_id=user_id,
            role=profile["role"],
            organization_id=profile["organization_id"],
        )
    except (KeyError, TypeError, ValidationError) as exc:
        raise ValueError("authoritative profile is incomplete") from exc


def verify_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> TokenPayload:
    """Validate a Supabase bearer token and resolve the server-side principal."""
    token = ""
    unverified_header: dict[str, Any] | None = None
    try:
        token = _extract_token(credentials)
        clean_token = token.strip()
        if (
            not clean_token
            or clean_token.lower() in {"null", "undefined", "none"}
            or clean_token.count(".") != 2
        ):
            raise ValueError("malformed bearer token")

        # Read the header only to select from the pinned Supabase algorithms.
        unverified_header = jwt.get_unverified_header(clean_token)
        token_alg = unverified_header.get("alg", "HS256")
        if token_alg not in {"HS256", "RS256", "ES256"}:
            raise ValueError("unsupported JWT algorithm")

        if token_alg in {"RS256", "ES256"}:
            jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
            jwks_response = httpx.get(
                jwks_url,
                headers={"apikey": str(settings.supabase_key)},
                timeout=5.0,
            )
            jwks_response.raise_for_status()
            jwks_document = jwks_response.json()
            key_id = unverified_header.get("kid")
            matching_key = next(
                (
                    key for key in jwks_document.get("keys", [])
                    if key.get("kid") == key_id
                ),
                None,
            )
            if not matching_key:
                raise ValueError("Supabase JWKS key not found")
            secret_or_key = jwk.construct(matching_key, algorithm=token_alg)
        else:
            secret_or_key = str(settings.supabase_jwt_secret)

        payload = jwt.decode(
            clean_token,
            secret_or_key,
            algorithms=[token_alg],
            options={"verify_aud": False},
        )
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("missing JWT subject")

        principal = _resolve_principal(clean_token, user_id)
        request.state.access_token = token
        request.state.principal = principal
        return principal
    except HTTPException:
        raise
    except (ValueError, PyJWTError, JWTError) as exc:
        try:
            unverified_payload = jwt.decode(
                token,
                options={"verify_signature": False},
            )
            inspected_claims = {
                claim: unverified_payload.get(claim)
                for claim in ("aud", "exp", "iss")
            }
        except Exception as inspection_error:
            inspected_claims = {"inspection_error": type(inspection_error).__name__}

        logging.error(
            "JWT validation failed: type=%s message=%s alg_header=%s request_id=%s",
            type(exc).__name__,
            str(exc),
            unverified_header if unverified_header is not None else "unknown",
            getattr(request.state, "request_id", "unknown"),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except Exception as exc:
        logging.error(
            "JWT validation failed: type=%s message=%s alg_header=%s request_id=%s",
            type(exc).__name__,
            str(exc),
            unverified_header if unverified_header is not None else "unknown",
            getattr(request.state, "request_id", "unknown"),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


def require_role(allowed_roles: List[str]):
    """Return a dependency that permits only explicitly listed profile roles."""
    allowed = frozenset(role.strip() for role in allowed_roles if role.strip())

    def role_checker(
        request: Request,
        token: TokenPayload = Depends(verify_token),
    ) -> TokenPayload:
        principal = getattr(request.state, "principal", None)
        if not isinstance(principal, TokenPayload) or principal.user_id != token.user_id:
            raise HTTPException(status_code=401, detail="Could not validate credentials")
        if principal.role not in allowed:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to access this resource.",
            )
        return principal

    return role_checker


def verify_dummy_hash() -> None:
    """Perform a fixed-cost hash operation for login timing uniformity."""
    hashlib.pbkdf2_hmac("sha256", b"dummy_password", b"dummy_salt", 100000)
