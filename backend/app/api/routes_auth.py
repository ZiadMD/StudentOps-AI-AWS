"""
Authentication and User Account Management Endpoints for StudentOps AI.
"""
from typing import Optional, Any
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, func
import jwt

from app.core.database import get_db
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.core.dependencies import (
    get_current_active_user,
    require_roles
)
from app.models.entities import User, Team, Student
from app.models.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse,
    RefreshTokenRequest,
    TeamResponse,
    TeamCreateRequest
)

router = APIRouter(prefix="/auth", tags=["Auth"])


def _build_user_response(user: User) -> UserResponse:
    """Helper to convert a User ORM model with relations to UserResponse schema."""
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        arabic_name=user.arabic_name,
        role=user.role,
        team_id=user.team_id,
        team_name=user.team.name if user.team else None,
        student_id=user.student_id,
        is_active=user.is_active,
        created_at=user.created_at
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    payload: UserRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Registers a new user account, creates credentials, links existing Student entity if present,
    and returns initial JWT access & refresh tokens.
    """
    email_clean = payload.email.strip().lower()

    # Check for existing user email
    existing_user_res = await db.execute(
        select(User).where(func.lower(User.email) == email_clean)
    )
    if existing_user_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{payload.email}' already exists."
        )

    # Validate team_id if provided
    if payload.team_id:
        team_res = await db.execute(select(Team).where(Team.id == payload.team_id))
        if not team_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Team with ID '{payload.team_id}' not found."
            )

    # Check if a matching student profile already exists in the system
    student_res = await db.execute(
        select(Student).where(func.lower(Student.email) == email_clean)
    )
    matched_student = student_res.scalar_one_or_none()
    student_id = matched_student.id if matched_student else None

    # Link team to student if not already assigned
    if matched_student and payload.team_id and not matched_student.team_id:
        matched_student.team_id = payload.team_id

    # Create new User entity
    new_user = User(
        id=f"usr_{uuid.uuid4().hex[:12]}",
        email=email_clean,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        arabic_name=payload.arabic_name.strip() if payload.arabic_name else None,
        role=payload.role.lower(),
        team_id=payload.team_id,
        student_id=student_id,
        is_active=True
    )
    db.add(new_user)
    await db.commit()

    # Reload with relationships
    res = await db.execute(
        select(User)
        .options(selectinload(User.team))
        .where(User.id == new_user.id)
    )
    user_loaded = res.scalar_one()

    # Issue tokens
    token_claims = {
        "sub": user_loaded.id,
        "email": user_loaded.email,
        "role": user_loaded.role,
        "team_id": user_loaded.team_id
    }
    access_token = create_access_token(token_claims)
    refresh_token = create_refresh_token(token_claims)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=_build_user_response(user_loaded)
    )


@router.post("/login", response_model=TokenResponse)
async def login_user(
    payload: UserLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticates a user via email and password (JSON body),
    returning access and refresh JWT tokens.
    """
    email_clean = payload.email.strip().lower()

    res = await db.execute(
        select(User)
        .options(selectinload(User.team))
        .where(func.lower(User.email) == email_clean)
    )
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your user account has been deactivated. Please contact HR."
        )

    # Generate JWT pair
    token_claims = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "team_id": user.team_id
    }
    access_token = create_access_token(token_claims)
    refresh_token = create_refresh_token(token_claims)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=_build_user_response(user)
    )


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
async def login_for_swagger_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Compatibility endpoint for Swagger UI's Authorize popup (form-urlencoded)."""
    return await login_user(
        UserLoginRequest(email=form_data.username, password=form_data.password),
        db=db
    )


@router.post("/refresh")
async def refresh_access_token(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Validates a JWT refresh token and returns a freshly minted access token.
    """
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type: refresh token expected."
            )
        user_id = decoded.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired. Please log in again."
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token."
        )

    # Verify user is active
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer active or valid."
        )

    new_access_token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "team_id": user.team_id
    })

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """Returns the authenticated user's profile and active organization role."""
    return _build_user_response(current_user)


@router.get("/teams", response_model=list[TeamResponse])
async def list_teams(
    db: AsyncSession = Depends(get_db)
):
    """Lists all teams in the organization for selection and scoping."""
    res = await db.execute(select(Team).order_by(Team.name.asc()))
    teams = res.scalars().all()
    results = []
    for t in teams:
        # Count members
        count_res = await db.execute(
            select(func.count(User.id)).where(User.team_id == t.id)
        )
        member_count = count_res.scalar() or 0
        results.append(TeamResponse(
            id=t.id,
            name=t.name,
            code=t.code,
            description=t.description or "",
            created_at=t.created_at,
            member_count=member_count
        ))
    return results


@router.post("/teams", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(["hr_admin"]))
):
    """Creates a new organizational team (HR Admin only)."""
    # Check duplicate code or name
    existing = await db.execute(
        select(Team).where((Team.code == payload.code.upper()) | (Team.name == payload.name))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Team with name '{payload.name}' or code '{payload.code}' already exists."
        )

    new_team = Team(
        id=f"team_{uuid.uuid4().hex[:8]}",
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        description=payload.description.strip() if payload.description else ""
    )
    db.add(new_team)
    await db.commit()
    await db.refresh(new_team)

    return TeamResponse(
        id=new_team.id,
        name=new_team.name,
        code=new_team.code,
        description=new_team.description,
        created_at=new_team.created_at,
        member_count=0
    )
