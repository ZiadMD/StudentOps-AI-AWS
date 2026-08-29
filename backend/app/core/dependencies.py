"""
FastAPI Authentication & RBAC Dependencies for StudentOps AI.
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
import jwt

from app.core.database import get_db
from app.core.security import decode_token
from app.models.entities import User, Student

# OAuth2 scheme configured for Swagger UI Bearer authorization
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login",
    auto_error=False
)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Extracts Bearer token from request headers, validates signature & expiration,
    and loads the corresponding User entity with Team relationships.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(token)
        user_id: Optional[str] = payload.get("sub")
        token_type: Optional[str] = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again or refresh your session.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.PyJWTError, Exception):
        raise credentials_exception

    # Query user with eager-loaded team
    query = (
        select(User)
        .options(selectinload(User.team))
        .where(User.id == user_id)
    )
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Ensure the authenticated user account is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact an administrator."
        )
    return current_user


def require_roles(allowed_roles: list[str]):
    """
    Dependency factory that enforces Role-Based Access Control (RBAC).
    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_roles(["hr_admin"]))])
    """
    async def role_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of roles [{', '.join(allowed_roles)}]. Your role: '{current_user.role}'."
            )
        return current_user

    return role_checker


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Optional user extractor for endpoints that serve both public and authenticated clients."""
    if not token:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None


async def verify_student_access(
    student_id: str,
    current_user: User,
    db: AsyncSession
) -> Student:
    """
    Verifies that the current user has permission to access the target student record:
    - hr_admin: full access to any student
    - team_lead: allowed if student.team_id == current_user.team_id (403 otherwise)
    - member: allowed only if student.id == current_user.student_id (403 otherwise)
    """
    res = await db.execute(select(Student).where(Student.id == student_id))
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

    if current_user.role == "hr_admin":
        return student
    elif current_user.role == "team_lead":
        if student.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: this student belongs to a different team."
            )
        return student
    else:  # member
        if student.id != current_user.student_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you may only view your own student profile."
            )
        return student

