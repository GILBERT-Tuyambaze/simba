from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str  # Now a string UUID (platform sub)
    email: str
    name: Optional[str] = None
    role: str = "customer"
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class FirebaseTokenExchangeRequest(BaseModel):
    """Request body for exchanging a Firebase ID token for an app token."""

    id_token: str


class TokenExchangeResponse(BaseModel):
    """Response body for issued application token and user profile."""

    token: str
    expires_at: datetime
    user: UserResponse
