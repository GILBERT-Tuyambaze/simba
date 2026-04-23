import logging
from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.invitations import Invitations

logger = logging.getLogger(__name__)


class InvitationsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Invitations:
        invitation = Invitations(**data)
        self.db.add(invitation)
        await self.db.commit()
        await self.db.refresh(invitation)
        return invitation

    async def get_by_token(self, token: str) -> Optional[Invitations]:
        result = await self.db.execute(select(Invitations).where(Invitations.token == token))
        return result.scalar_one_or_none()

    async def get_list(self, created_by: Optional[str] = None) -> Dict[str, Any]:
        query = select(Invitations).order_by(Invitations.id.desc())
        count_query = select(func.count(Invitations.id))

        if created_by:
            query = query.where(Invitations.created_by == created_by)
            count_query = count_query.where(Invitations.created_by == created_by)

        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0
        result = await self.db.execute(query)
        items = result.scalars().all()
        return {"items": items, "total": total, "skip": 0, "limit": total}

    async def update(self, invitation: Invitations, updates: Dict[str, Any]) -> Invitations:
        for key, value in updates.items():
            if hasattr(invitation, key):
                setattr(invitation, key, value)
        await self.db.commit()
        await self.db.refresh(invitation)
        return invitation
