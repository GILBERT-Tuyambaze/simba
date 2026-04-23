from core.database import Base
from sqlalchemy import Column, Integer, String


class Invitations(Base):
    __tablename__ = "invitations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    token = Column(String, nullable=False)
    role = Column(String, nullable=False)
    branch = Column(String, nullable=True)
    invited_email = Column(String, nullable=True)
    note = Column(String, nullable=True)
    created_by = Column(String, nullable=False)
    inviter_role = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    used_by = Column(String, nullable=True)
    used_at = Column(String, nullable=True)
    expires_at = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
