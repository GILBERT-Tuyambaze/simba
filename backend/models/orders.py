from core.database import Base
from sqlalchemy import Column, Float, Integer, String


class Orders(Base):
    __tablename__ = "orders"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    customer_name = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    assigned_branch = Column(String, nullable=True)
    items = Column(String, nullable=False)
    subtotal = Column(Float, nullable=True)
    shipping = Column(Float, nullable=True)
    discount = Column(Float, nullable=True)
    deposit_amount = Column(Float, nullable=True)
    total = Column(Float, nullable=False)
    delivery_method = Column(String, nullable=True)
    delivery_option = Column(String, nullable=True)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    status = Column(String, nullable=True)
    tracking_number = Column(String, nullable=True)
    pickup_time = Column(String, nullable=True)
    assigned_staff_id = Column(String, nullable=True)
    assigned_staff_name = Column(String, nullable=True)
    assigned_delivery_agent_id = Column(String, nullable=True)
    assigned_delivery_agent_name = Column(String, nullable=True)
    rating = Column(Integer, nullable=True)
    review_comment = Column(String, nullable=True)
    review_branch = Column(String, nullable=True)
    timeline = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
