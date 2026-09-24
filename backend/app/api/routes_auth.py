"""
Authentication and User Account Management Endpoints for StudentOps AI.
"""
from typing import Optional, Any
from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, func
import jwt

from app.core.database import get_db
from app.core.time import as_utc
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    validate_password_strength,
    hash_invitation_token
)
from app.core.dependencies import (
    get_current_active_user,
    require_roles,
    rate_limit_login,
    rate_limit_register,
    rate_limit_refresh
)
from app.models.entities import User, Team, Student, StudentInvitation, RefreshSession
from app.services.audit_service import AuditService
from app.models.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse,
    RefreshTokenRequest,
    TeamResponse,
    TeamCreateRequest,
    UserRoleUpdateRequest,
    StudentLinkRequest
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


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_register)])
async def register_user(
    payload: UserRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Registers a new user account, creates credentials, links existing Student entity if present,
    and returns initial JWT access & refresh tokens.
    
    SECURITY ENFORCEMENT:
    - All self-registrations are strictly created as 'member'.
    - Elevated roles (hr_admin, team_lead) can only be assigned by existing HR Admins.
    - Password complexity is validated server-side.
    """
    # 1. Validate password strength
    is_valid, err_msg = validate_password_strength(payload.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg
        )

    email_clean = payload.email.strip().lower()

    # 2. Check for existing user email
    existing_user_res = await db.execute(
        select(User).where(func.lower(User.email) == email_clean)
    )
    if existing_user_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{payload.email}' already exists."
        )

    # 3. Validate team_id if provided
    if payload.team_id:
        team_res = await db.execute(select(Team).where(Team.id == payload.team_id))
        if not team_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Team with ID '{payload.team_id}' not found."
            )

    # 4. Process secure student profile linking via trusted invitation token only
    # SECURITY HARDENING (Account Takeover & Enumeration Prevention):
    # - Knowing an existing student's email address MUST NEVER auto-link the account.
    # - Self-registration without a valid cryptographic invitation token strictly sets student_id = None.
    # - Email equality alone is never sufficient to establish student identity.
    student_id = None
    assigned_team_id = payload.team_id
    invitation_to_mark: Optional[StudentInvitation] = None

    if payload.invitation_token and payload.invitation_token.strip():
        tok_clean = payload.invitation_token.strip()
        tok_hash = hash_invitation_token(tok_clean)

        inv_res = await db.execute(
            select(StudentInvitation)
            .options(selectinload(StudentInvitation.student))
            .where(StudentInvitation.token_hash == tok_hash)
        )
        invitation = inv_res.scalar_one_or_none()
        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid invitation token."
            )
        if invitation.is_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation token has already been used."
            )

        now = datetime.now(timezone.utc)
        inv_exp = as_utc(invitation.expires_at)
        if inv_exp < now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation token has expired."
            )

        student = invitation.student
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated student profile not found."
            )

        # Verify student profile is not already claimed by another active user
        claimed_res = await db.execute(
            select(User).where(User.student_id == student.id)
        )
        if claimed_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This student profile is already linked to an existing account."
            )

        # Cryptographic invitation tokens are strictly bound to the intended student's email
        if student.email.lower() != email_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation token is bound to a different email address."
            )

        student_id = student.id
        assigned_team_id = student.team_id or payload.team_id
        invitation_to_mark = invitation

    # 5. Create new User entity with strictly non-privileged 'member' role
    new_user = User(
        id=f"usr_{uuid.uuid4().hex[:12]}",
        email=email_clean,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        arabic_name=payload.arabic_name.strip() if payload.arabic_name else None,
        role="member",  # Non-negotiable server-side enforcement: normal users cannot self-assign roles
        team_id=assigned_team_id,
        student_id=student_id,
        is_active=True
    )
    db.add(new_user)
    if invitation_to_mark:
        invitation_to_mark.is_used = True
        invitation_to_mark.used_at = datetime.now(timezone.utc)
        invitation_to_mark.used_by_user_id = new_user.id

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
    
    decoded_rt = decode_token(refresh_token)
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    new_session = RefreshSession(
        id=session_id,
        user_id=user_loaded.id,
        refresh_token_jti=decoded_rt["jti"],
        expires_at=datetime.fromtimestamp(decoded_rt["exp"], tz=timezone.utc)
    )
    db.add(new_session)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=_build_user_response(user_loaded)
    )


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit_login)])
async def login_user(
    payload: UserLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticates a user via email and password (JSON body),
    returning access and refresh JWT tokens.
    Protected by server-side brute-force rate limiting.
    """
    raw_id = payload.email or payload.username or payload.identifier
    if not raw_id or not raw_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    identifier_clean = raw_id.strip().lower()

    # Search candidates: exact email/identifier, or with default domain @studentops.org if domain omitted
    lookup_candidates = [identifier_clean]
    if "@" not in identifier_clean:
        lookup_candidates.append(f"{identifier_clean}@studentops.org")

    res = await db.execute(
        select(User)
        .options(selectinload(User.team))
        .where(
            (func.lower(User.email).in_(lookup_candidates)) |
            (User.id == identifier_clean)
        )
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
    
    decoded_rt = decode_token(refresh_token)
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    new_session = RefreshSession(
        id=session_id,
        user_id=user.id,
        refresh_token_jti=decoded_rt["jti"],
        expires_at=datetime.fromtimestamp(decoded_rt["exp"], tz=timezone.utc)
    )
    db.add(new_session)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=_build_user_response(user)
    )


@router.post("/token", response_model=TokenResponse, include_in_schema=False, dependencies=[Depends(rate_limit_login)])
async def login_for_swagger_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Compatibility endpoint for Swagger UI's Authorize popup (form-urlencoded)."""
    return await login_user(
        UserLoginRequest(email=form_data.username, password=form_data.password),
        db=db
    )


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(rate_limit_refresh)])
async def refresh_access_token(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Validates a JWT refresh token, checks for revocation, rotates the session, and returns fresh tokens.
    """
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type: refresh token expected."
            )
        user_id = decoded.get("sub")
        jti = decoded.get("jti")
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

    # Verify session is not revoked
    res_session = await db.execute(
        select(RefreshSession).where(RefreshSession.refresh_token_jti == jti)
    )
    session = res_session.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh session not found."
        )
    if session.revoked_at:
        # POTENTIAL THEFT DETECTED: A revoked token is being reused.
        # Revoke ALL sessions for this user as a defense mechanism.
        await db.execute(
            select(RefreshSession).where(RefreshSession.user_id == user_id)
        ) # Just logic outline, actually let's just revoke everything.
        now = datetime.now(timezone.utc)
        all_user_sessions_res = await db.execute(select(RefreshSession).where(RefreshSession.user_id == user_id))
        for s in all_user_sessions_res.scalars():
            if not s.revoked_at:
                s.revoked_at = now
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All sessions revoked."
        )

    # Verify user is active
    res = await db.execute(select(User).options(selectinload(User.team)).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer active or valid."
        )

    # Rotate tokens
    now = datetime.now(timezone.utc)
    session.revoked_at = now  # Revoke the old one
    
    token_claims = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "team_id": user.team_id
    }
    new_access_token = create_access_token(token_claims)
    new_refresh_token = create_refresh_token(token_claims)
    
    decoded_new_rt = decode_token(new_refresh_token)
    new_session = RefreshSession(
        id=f"sess_{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        refresh_token_jti=decoded_new_rt["jti"],
        expires_at=datetime.fromtimestamp(decoded_new_rt["exp"], tz=timezone.utc)
    )
    db.add(new_session)
    await db.commit()

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user=_build_user_response(user)
    )


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


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    payload: UserRoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["hr_admin"]))
):
    """
    Updates a user's role (HR Admin only).
    Prevents unauthorized privilege escalation by requiring admin authorization.
    """
    res = await db.execute(
        select(User)
        .options(selectinload(User.team))
        .where(User.id == user_id)
    )
    target_user = res.scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{user_id}' not found."
        )

    # Prevent admin from de-admining themselves if they are the only admin
    if target_user.id == admin_user.id and payload.role != "hr_admin":
        admin_count_res = await db.execute(
            select(func.count(User.id)).where(User.role == "hr_admin", User.is_active == True)
        )
        admin_count = admin_count_res.scalar() or 0
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last remaining active HR administrator."
            )

    old_role = target_user.role
    target_user.role = payload.role
    await db.commit()
    await db.refresh(target_user)

    await AuditService.record_action(
        db=db,
        intent="UPDATE_USER_ROLE",
        tool_name="api_routes_auth",
        parameters={"target_user_id": user_id, "old_role": old_role, "new_role": payload.role},
        result={"status": "SUCCESS"},
        user_id=admin_user.id,
        status="EXECUTED"
    )

    return _build_user_response(target_user)


@router.post("/link-student", response_model=UserResponse)
async def link_student_profile(
    payload: StudentLinkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Securely links an existing authenticated user account to a Student profile using a trusted HR-issued invitation token.
    Enforces single-use, email binding, and prevents account hijacking.
    """
    if current_user.student_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is already linked to a student profile."
        )

    tok_clean = payload.invitation_token.strip()
    tok_hash = hash_invitation_token(tok_clean)

    inv_res = await db.execute(
        select(StudentInvitation)
        .options(selectinload(StudentInvitation.student))
        .where(StudentInvitation.token_hash == tok_hash)
    )
    invitation = inv_res.scalar_one_or_none()
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invitation token."
        )
    if invitation.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token has already been used."
        )

    now = datetime.now(timezone.utc)
    inv_exp = as_utc(invitation.expires_at)
    if inv_exp < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token has expired."
        )

    student = invitation.student
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated student profile not found."
        )

    # Verify student profile is not already claimed
    claimed_res = await db.execute(
        select(User).where(User.student_id == student.id)
    )
    if claimed_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This student profile is already linked to an existing account."
        )

    # Verify token is bound to this specific user's email
    if student.email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token is bound to a different email address."
        )

    current_user.student_id = student.id
    if student.team_id and not current_user.team_id:
        current_user.team_id = student.team_id

    invitation.is_used = True
    invitation.used_at = now
    invitation.used_by_user_id = current_user.id

    await db.commit()
    await db.refresh(current_user)

    # Reload with relationships
    res = await db.execute(
        select(User)
        .options(selectinload(User.team))
        .where(User.id == current_user.id)
    )
    user_loaded = res.scalar_one()
    return _build_user_response(user_loaded)



@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Revokes the provided refresh token to end the session."""
    try:
        decoded = decode_token(payload.refresh_token)
        jti = decoded.get("jti")
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
        
    res = await db.execute(select(RefreshSession).where(RefreshSession.refresh_token_jti == jti))
    session = res.scalar_one_or_none()
    if session and session.user_id == current_user.id and not session.revoked_at:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
    return {"detail": "Successfully logged out"}


@router.post("/logout-all", status_code=status.HTTP_200_OK)
async def logout_all(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Revokes all active sessions for the current user."""
    res = await db.execute(
        select(RefreshSession).where(
            RefreshSession.user_id == current_user.id,
            RefreshSession.revoked_at == None
        )
    )
    sessions = res.scalars().all()
    now = datetime.now(timezone.utc)
    for s in sessions:
        s.revoked_at = now
    await db.commit()
    return {"detail": f"Successfully revoked {len(sessions)} active sessions."}

