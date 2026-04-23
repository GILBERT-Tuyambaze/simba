from core.database import Base
from sqlalchemy import Column, Float, Integer, String


class Cart_items(Base):
    __tablename__ = "cart_items"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    product_id = Column(Integer, nullable=False)
    product_name = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    image = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    branch = Column(String, nullable=True)
    created_at = Column(String, nullable=True)