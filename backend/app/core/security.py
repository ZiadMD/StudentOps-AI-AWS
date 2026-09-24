"""
Security and Cryptographic Utilities for StudentOps AI.
Handles Password Hashing (Bcrypt) and JWT Token Operations (PyJWT).
"""
from typing import Optional, Any
from datetime import datetime, timezone, timedelta
import secrets
import hashlib
import bcrypt
import jwt
import uuid

from app.core.config import settings


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password complexity:
    - Minimum length: 8 characters
    - Maximum length: 128 characters (prevents bcrypt 72-byte truncation issues and DoS)
    - Must not consist purely of whitespace
    - Must contain at least one letter and at least one digit or special character
    """
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if len(password) > 128:
        return False, "Password must not exceed 128 characters."
    if password.strip() == "":
        return False, "Password must not be only whitespace."
    has_letter = any(c.isalpha() for c in password)
    has_digit_or_punct = any(c.isdigit() or not c.isalnum() for c in password)
    if not (has_letter and has_digit_or_punct):
        return False, "Password must contain at least one letter and at least one digit or special character."
    return True, ""


def get_password_hash(password: str) -> str:
    """Hash a plain password using Bcrypt with a random salt."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against an existing Bcrypt hash."""
    if not hashed_password or not plain_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False



def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generate a signed JWT access token.
    Standard expiration defaults to settings.ACCESS_TOKEN_EXPIRE_MINUTES.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": expire,
        "iat": now,
        "type": "access"
    })
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generate a signed JWT refresh token with extended validity.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    jti = str(uuid.uuid4())
    to_encode.update({
        "exp": expire,
        "iat": now,
        "type": "refresh",
        "jti": jti
    })
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a signed JWT token.
    Raises jwt.PyJWTError on invalid or expired signature.
    """
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM]
    )


def hash_invitation_token(raw_token: str) -> str:
    """Hashes invitation token using SHA-256 for secure database storage."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def generate_invitation_token() -> tuple[str, str]:
    """
    Generates a cryptographically secure, unpredictable invitation token.
    Returns (raw_token, token_hash).
    Only raw_token is delivered to the user; token_hash is stored in the database.
    """
    raw_token = f"inv_{secrets.token_urlsafe(32)}"
    token_hash = hash_invitation_token(raw_token)
    return raw_token, token_hash
