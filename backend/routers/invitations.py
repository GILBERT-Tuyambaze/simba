import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.store_roles import (
    can_invite_role,
    can_update_existing_roles,
    is_branch_scoped,
    normalize_store_role,
)
from dependencies.auth import get_current_user
from models.auth import User
from models.user_profiles import User_profiles
from schemas.auth import UserResponse
from services.invitations import InvitationsService

router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])


class InvitationCreateRequest(BaseModel):
    role: str
    branch: Optional[str] = None
    invited_email: Optional[str] = None
    note: Optional[str] = None
    expires_in_days: int = 7


class InvitationPreviewResponse(BaseModel):
    token: str
    role: str
    branch: Optional[str] = None
    invited_email: Optional[str] = None
    status: str
    expires_at: Optional[str] = None

    class Config:
        from_attributes = True


class InvitationListResponse(BaseModel):
    items: List[InvitationPreviewResponse]
    total: int
    skip: int
    limit: int


class RoleUpdateRequest(BaseModel):
    role: str
    branch: Optional[str] = None


async def _get_latest_profile(db: AsyncSession, user_id: str) -> Optional[User_profiles]:
    result = await db.execute(
        select(User_profiles)
        .where(User_profiles.user_id == user_id)
        .order_by(User_profiles.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _is_expired(expires_at: Optional[str]) -> bool:
    if not expires_at:
        return False
    try:
        return datetime.fromisoformat(expires_at) < datetime.now(timezone.utc)
    except ValueError:
        return False


@router.get("", response_model=InvitationListResponse)
async def list_invitations(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor_role = normalize_store_role(current_user.role)
    service = InvitationsService(db)
    result = await service.get_list(None if actor_role == "super_admin" else str(current_user.id))
    return result


@router.get("/{token}", response_model=InvitationPreviewResponse)
async def preview_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    service = InvitationsService(db)
    invitation = await service.get_by_token(token)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status != "pending" or _is_expired(invitation.expires_at):
        raise HTTPException(status_code=410, detail="Invitation is no longer valid")
    return invitation


@router.post("", response_model=InvitationPreviewResponse, status_code=201)
async def create_invitation(
    payload: InvitationCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor_role = normalize_store_role(current_user.role)
    target_role = normalize_store_role(payload.role)

    if not can_invite_role(actor_role, target_role):
        raise HTTPException(status_code=403, detail="You cannot invite that role")

    actor_profile = await _get_latest_profile(db, str(current_user.id))
    branch_value = payload.branch
    if is_branch_scoped(actor_role):
        actor_branch = actor_profile.default_branch if actor_profile else None
        if not actor_branch:
            raise HTTPException(status_code=400, detail="Your account is missing an assigned branch")
        if branch_value and branch_value != actor_branch:
            raise HTTPException(status_code=403, detail="You can only invite users into your own branch")
        branch_value = actor_branch

    if target_role in {"branch_manager", "branch_staff", "delivery_agent"} and not branch_value:
        raise HTTPException(status_code=400, detail="Branch is required for that role")

    invitation = await InvitationsService(db).create(
        {
            "token": secrets.token_urlsafe(24),
            "role": target_role,
            "branch": branch_value,
            "invited_email": (payload.invited_email or "").strip().lower() or None,
            "note": payload.note,
            "created_by": str(current_user.id),
            "inviter_role": actor_role,
            "status": "pending",
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=max(payload.expires_in_days, 1))).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return invitation


@router.post("/{token}/accept", response_model=UserResponse)
async def accept_invitation(
    token: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = InvitationsService(db)
    invitation = await service.get_by_token(token)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status != "pending" or _is_expired(invitation.expires_at):
        raise HTTPException(status_code=410, detail="Invitation is no longer valid")

    current_role = normalize_store_role(current_user.role)
    if invitation.invited_email and invitation.invited_email != (current_user.email or "").strip().lower():
        raise HTTPException(status_code=403, detail="Invitation email does not match this account")
    if current_role != "customer" and current_role != normalize_store_role(invitation.role):
        raise HTTPException(status_code=403, detail="This account already has a fixed role")

    user_result = await db.execute(select(User).where(User.id == str(current_user.id)))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = await _get_latest_profile(db, str(current_user.id))
    role_value = normalize_store_role(invitation.role)
    if profile is None:
        profile = User_profiles(
            user_id=str(current_user.id),
            display_name=current_user.name,
            email=current_user.email,
            role=role_value,
            default_branch=invitation.branch,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(profile)
    else:
        profile.role = role_value
        if invitation.branch:
            profile.default_branch = invitation.branch

    user.role = role_value
    invitation.status = "accepted"
    invitation.used_by = str(current_user.id)
    invitation.used_at = datetime.now(timezone.utc).isoformat()

    await db.commit()
    await db.refresh(user)

    return UserResponse.model_validate(user)


@router.put("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    payload: RoleUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not can_update_existing_roles(current_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only super admin can update existing roles")

    role_value = normalize_store_role(payload.role)
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = await _get_latest_profile(db, user_id)
    if profile is None:
        profile = User_profiles(
            user_id=user_id,
            display_name=user.name,
            email=user.email,
            role=role_value,
            default_branch=payload.branch,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(profile)
    else:
        profile.role = role_value
        if payload.branch is not None:
            profile.default_branch = payload.branch

    user.role = role_value
    await db.commit()
    await db.refresh(user)

    return UserResponse.model_validate(user)
