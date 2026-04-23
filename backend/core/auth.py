import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from core.config import settings
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

logger = logging.getLogger(__name__)


class AccessTokenError(Exception):
    """Custom exception for application JWT access token errors."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


def create_access_token(claims: Dict[str, Any], expires_minutes: Optional[int] = None) -> str:
    """Create signed JWT access token from provided claims."""
    if not settings.jwt_secret_key:
        logger.error("JWT secret key is not configured")
        raise ValueError("JWT secret key is not configured")

    now = datetime.now(timezone.utc)
    token_claims = claims.copy()

    expiry_minutes = expires_minutes if expires_minutes is not None else int(settings.jwt_expire_minutes)
    expire_at = now + timedelta(minutes=expiry_minutes)

    token_claims.update(
        {
            "exp": expire_at,
            "iat": now,
            "nbf": now,
        }
    )

    token = jwt.encode(token_claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    # Log user hash instead of actual user ID to avoid exposing sensitive information
    user_id = token_claims.get("sub", "unknown")
    user_hash = hashlib.sha256(str(user_id).encode()).hexdigest()[:8] if user_id != "unknown" else "unknown"
    logger.debug("Authentication token created for user hash: %s", user_hash)
    return token


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT access token."""
    if not settings.jwt_secret_key:
        logger.error("JWT secret key is not configured")
        raise AccessTokenError("Authentication service is misconfigured")

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        # Log user hash instead of actual user ID to avoid exposing sensitive information
        user_id = payload.get("sub", "unknown")
        user_hash = hashlib.sha256(str(user_id).encode()).hexdigest()[:8] if user_id != "unknown" else "unknown"
        logger.debug("Authentication token validated for user hash: %s", user_hash)
        return payload
    except ExpiredSignatureError as exc:
        logger.info("Authentication token has expired")
        raise AccessTokenError("Token has expired") from exc
    except JWTError as exc:
        # Log error type only, not the full exception which may contain sensitive token data
        logger.warning("Token validation failed: %s", type(exc).__name__)
        raise AccessTokenError("Invalid authentication token") from exc
