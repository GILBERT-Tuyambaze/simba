import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.firebase import FirebaseAuthError, verify_firebase_id_token
from core.database import get_db
from core.store_roles import normalize_store_role
from dependencies.auth import get_current_user
from models.user_profiles import User_profiles
from schemas.auth import FirebaseTokenExchangeRequest, TokenExchangeResponse, UserResponse
from services.auth import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
logger = logging.getLogger(__name__)


def derive_name_from_email(email: str) -> str:
    return email.split("@", 1)[0] if email else ""


def map_firebase_error(error_type: str) -> int:
    if error_type in {"token_expired", "token_revoked", "invalid_token", "project_mismatch", "token_used_too_early"}:
        return status.HTTP_401_UNAUTHORIZED
    if error_type in {"not_configured", "missing_service_account_file"}:
        return status.HTTP_503_SERVICE_UNAVAILABLE
    return status.HTTP_500_INTERNAL_SERVER_ERROR


@router.post("/token/exchange", response_model=TokenExchangeResponse)
async def exchange_firebase_token(
    payload: FirebaseTokenExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a Firebase ID token for an application JWT."""
    auth_service = AuthService(db)

    try:
        claims = verify_firebase_id_token(payload.id_token)
    except FirebaseAuthError as exc:
        logger.warning("[token/exchange] Firebase token validation failed: %s", exc.error_type)
        raise HTTPException(status_code=map_firebase_error(exc.error_type), detail=exc.message) from exc

    firebase_uid = str(claims.get("uid") or claims.get("sub") or claims.get("user_id") or "").strip()
    if not firebase_uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Firebase token payload missing user id")

    email = str(claims.get("email") or "").strip()
    name = claims.get("name") or claims.get("display_name") or derive_name_from_email(email)

    user = await auth_service.get_or_create_user(platform_sub=firebase_uid, email=email, name=name)

    profile_result = await db.execute(
        select(User_profiles)
        .where(User_profiles.user_id == firebase_uid)
        .order_by(User_profiles.id.desc())
        .limit(1)
    )
    profile = profile_result.scalar_one_or_none()

    is_admin = firebase_uid == str(settings.admin_user_id).strip() or (
        email and email == str(settings.admin_user_email).strip()
    )
    if is_admin:
        expected_role = "super_admin"
    elif profile and profile.role:
        expected_role = normalize_store_role(profile.role)
    else:
        expected_role = normalize_store_role(user.role)

    if user.role != expected_role:
        user.role = expected_role
        await db.commit()
        await db.refresh(user)

    if profile is None:
        profile = User_profiles(
            user_id=firebase_uid,
            display_name=name,
            email=email,
            role=expected_role,
            created_at=str(user.created_at or ""),
        )
        db.add(profile)
        await db.commit()
    elif normalize_store_role(profile.role) != expected_role:
        profile.role = expected_role
        if not profile.email:
            profile.email = email
        if not profile.display_name:
            profile.display_name = name
        await db.commit()

    app_token, expires_at, _ = await auth_service.issue_app_token(user=user)
    return TokenExchangeResponse(
        token=app_token,
        expires_at=expires_at,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_user)):
    """Get current user info."""
    return current_user
