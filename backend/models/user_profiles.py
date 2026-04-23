from core.database import Base
from sqlalchemy import Column, Integer, String


class User_profiles(Base):
    __tablename__ = "user_profiles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    role = Column(String, nullable=True)
    default_branch = Column(String, nullable=True)
    addresses = Column(String, nullable=True)
    preferred_payment_method = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
