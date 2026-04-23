import json
import logging
import os
import re
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from typing import List, Literal, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.config import settings
from core.database import get_db
from core.inventory import ensure_product_inventory, get_available_stock
from dependencies.auth import get_current_user
from models.products import Products
from models.user_profiles import User_profiles
from schemas.auth import UserResponse
from services.orders import OrdersService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/payment", tags=["payment"])

PROMO_CODE = "SIMBA2K"
PROMO_DISCOUNT = Decimal("2000")
PROMO_MIN_SUBTOTAL = Decimal("15000")
FREE_SHIPPING_THRESHOLD = Decimal("30000")
BASE_SHIPPING = Decimal("2500")
DEFAULT_PAYMENT_METHOD = "mtn_momo"
PAYMENT_METHOD_ALIASES = {
    "card": "card",
    "mtn": "mtn_momo",
    "mtn_momo": "mtn_momo",
    "mobile_money": "mtn_momo",
    "airtel": "airtel_money",
    "airtel_money": "airtel_money",
    "cash_on_delivery": "cash_on_delivery",
    "cod": "cash_on_delivery",
}
PAYMENT_LABELS = {
    "card": "Stripe card",
    "mtn_momo": "MTN MoMo",
    "airtel_money": "Airtel Money",
    "cash_on_delivery": "Cash on delivery",
}


def _strip_phone(phone: str) -> str:
    return re.sub(r"[\s\-\(\)]", "", phone or "").strip()


def _is_stripe_ready() -> bool:
    return bool(getattr(settings, "stripe_secret_key", "") or os.environ.get("STRIPE_SECRET_KEY"))


def _generate_tracking_number() -> str:
    suffix = os.urandom(3).hex().upper()
    return f"SIM-{datetime.now().strftime('%y%m%d%H%M%S')}-{suffix}"


def _to_decimal(value: Decimal | float | int | str) -> Decimal:
    return Decimal(str(value))


def _calculate_shipping(subtotal: Decimal, delivery_method: Literal["delivery", "pickup"]) -> Decimal:
    if delivery_method == "pickup":
        return Decimal("0")
    if subtotal >= FREE_SHIPPING_THRESHOLD:
        return Decimal("0")
    return BASE_SHIPPING


def _calculate_discount(subtotal: Decimal, promo_code: Optional[str]) -> Decimal:
    if not promo_code:
        return Decimal("0")

    normalized = promo_code.strip().upper()
    if normalized != PROMO_CODE:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid promo code. Use {PROMO_CODE} for the checkout discount.",
        )

    if subtotal < PROMO_MIN_SUBTOTAL:
        raise HTTPException(
            status_code=400,
            detail=f"Promo code {PROMO_CODE} requires a minimum spend of RWF {int(PROMO_MIN_SUBTOTAL):,}.",
        )

    return min(PROMO_DISCOUNT, subtotal)


def _normalize_address(address: Optional[str], delivery_method: Literal["delivery", "pickup"], branch: str) -> str:
    trimmed = (address or "").strip()
    if delivery_method == "pickup":
        return trimmed or f"Pickup from {branch}"
    return trimmed


def _resolve_frontend_url(path: str) -> str:
    base_url = (getattr(settings, "frontend_url", "") or "http://localhost:3000").rstrip("/")
    return f"{base_url}{path}"


def _append_query_params(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update({key: value for key, value in params.items() if value is not None and value != ""})
    return urlunparse(parsed._replace(query=urlencode(query)))


def _resolve_payment_method(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized not in PAYMENT_METHOD_ALIASES:
        raise ValueError("Unsupported payment method")
    return PAYMENT_METHOD_ALIASES[normalized]

class CheckoutCartItem(BaseModel):
    product_id: int = Field(..., ge=1)
    product_name: str = Field(..., min_length=1)
    price: Decimal = Field(..., ge=0)
    quantity: int = Field(..., ge=1)
    image: Optional[str] = None
    unit: Optional[str] = None

    @field_validator("price", mode="before")
    @classmethod
    def _coerce_price(cls, value):
        return _to_decimal(value)


class PaymentSessionRequest(BaseModel):
    items: List[CheckoutCartItem]
    branch: str = Field(..., min_length=1)
    customer_name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=1)
    address: Optional[str] = None
    delivery_method: Literal["delivery", "pickup"] = "delivery"
    delivery_option: Optional[Literal["delivery_by_branch", "delivery_by_delivery_guy", "self_pickup"]] = None
    delivery_agent_id: Optional[str] = None
    pickup_time: Optional[str] = None
    payment_method: str = DEFAULT_PAYMENT_METHOD
    promo_code: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    currency: str = "rwf"
    allow_partial_fulfillment: bool = False

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str) -> str:
        normalized = _strip_phone(value)
        if len(normalized) < 9:
            raise ValueError("Phone number is too short")
        return normalized

    @field_validator("currency")
    @classmethod
    def _normalize_currency(cls, value: str) -> str:
        return value.strip().lower() or "rwf"

    @field_validator("payment_method")
    @classmethod
    def _normalize_payment_method(cls, value: str) -> str:
        return _resolve_payment_method(value)

    @model_validator(mode="after")
    def _validate_model(self):
        if not self.items:
            raise ValueError("Cart is empty")

        if self.delivery_method == "delivery":
            address = (self.address or "").strip()
            if len(address) < 12:
                raise ValueError("Enter a fuller delivery address for home delivery")
            if self.delivery_option == "delivery_by_delivery_guy" and not self.delivery_agent_id:
                raise ValueError("Choose a delivery agent for direct delivery")
        else:
            self.delivery_option = "self_pickup"

        if self.allow_partial_fulfillment and self.delivery_method != "pickup":
            raise ValueError("Partial fulfillment is only available for pickup orders")

        if self.payment_method == "card":
            if not self.success_url:
                self.success_url = _resolve_frontend_url("/payment-success?session_id={CHECKOUT_SESSION_ID}")
            if not self.cancel_url:
                self.cancel_url = _resolve_frontend_url("/payment-cancel")

        return self


class PaymentSessionResponse(BaseModel):
    order_id: int
    tracking_number: str
    status: str
    payment_method: str
    subtotal: float
    shipping: float
    discount: float
    total: float
    deposit_amount: float = 0
    pickup_time: Optional[str] = None
    session_id: Optional[str] = None
    url: Optional[str] = None
    message: str


class VerifyPaymentRequest(BaseModel):
    session_id: str = Field(..., min_length=1)


class VerifyPaymentResponse(BaseModel):
    order_id: int
    tracking_number: str
    status: str
    payment_status: str
    total: float


@router.post("/create_payment_session", response_model=PaymentSessionResponse)
async def create_payment_session(
    data: PaymentSessionRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an order and, when requested, a Stripe checkout session."""
    logger.info(
        "Creating payment session for user=%s payment_method=%s items=%s",
        current_user.id,
        data.payment_method,
        len(data.items),
    )

    stock_issues: list[str] = []
    product_rows: dict[int, Products] = {}
    for item in data.items:
        result = await db.execute(select(Products).where(Products.id == item.product_id))
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_name} was not found")

        available_stock = get_available_stock(product, data.branch)
        product_rows[item.product_id] = product
        if not data.allow_partial_fulfillment and item.quantity > available_stock:
            stock_issues.append(
                f"{item.product_name} only has {available_stock} left for {data.branch}"
            )

    if stock_issues:
        raise HTTPException(status_code=400, detail="Insufficient stock: " + "; ".join(stock_issues))

    subtotal = sum((_to_decimal(item.price) * item.quantity for item in data.items), Decimal("0"))
    discount = _calculate_discount(subtotal, data.promo_code)
    shipping = _calculate_shipping(subtotal, data.delivery_method)
    deposit_amount = Decimal("2000") if data.delivery_method == "pickup" and data.allow_partial_fulfillment else Decimal("500") if data.delivery_method == "pickup" else Decimal("0")
    total = max(subtotal - discount + shipping + deposit_amount, Decimal("0"))
    tracking_number = _generate_tracking_number()
    if data.payment_method == "card":
        status_value = "awaiting_payment"
    elif data.payment_method in {"mtn_momo", "airtel_money"}:
        status_value = "awaiting_confirmation"
    else:
        status_value = "pending"
    order_address = _normalize_address(data.address, data.delivery_method, data.branch)
    assigned_delivery_agent_id = None
    assigned_delivery_agent_name = None
    delivery_option = data.delivery_option or ("self_pickup" if data.delivery_method == "pickup" else "delivery_by_branch")

    if delivery_option == "delivery_by_delivery_guy" and data.delivery_agent_id:
        delivery_profile_result = await db.execute(
            select(User_profiles)
            .where(User_profiles.user_id == data.delivery_agent_id)
            .order_by(User_profiles.id.desc())
            .limit(1)
        )
        delivery_profile = delivery_profile_result.scalar_one_or_none()
        if not delivery_profile:
            raise HTTPException(status_code=404, detail="Selected delivery agent was not found")
        assigned_delivery_agent_id = delivery_profile.user_id
        assigned_delivery_agent_name = delivery_profile.display_name or delivery_profile.email

    order_service = OrdersService(db)
    created_order = await order_service.create(
        {
            "customer_name": data.customer_name,
            "branch": data.branch,
            "assigned_branch": data.branch,
            "items": json.dumps(
                [
                    {
                        **item.model_dump(exclude={"price"}),
                        "price": float(item.price),
                    }
                    for item in data.items
                ]
            ),
            "subtotal": float(subtotal),
            "shipping": float(shipping),
            "discount": float(discount),
            "deposit_amount": float(deposit_amount),
            "total": float(total),
            "delivery_method": data.delivery_method,
            "delivery_option": delivery_option,
            "address": order_address,
            "phone": data.phone,
            "payment_method": data.payment_method,
            "status": status_value,
            "tracking_number": tracking_number,
            "pickup_time": data.pickup_time,
            "assigned_delivery_agent_id": assigned_delivery_agent_id,
            "assigned_delivery_agent_name": assigned_delivery_agent_name,
            "review_branch": data.branch,
            "timeline": json.dumps(
                [
                    {"status": status_value, "label": status_value.replace("_", " ").title(), "at": datetime.now().isoformat()}
                ]
            ),
            "created_at": datetime.now().isoformat(),
        },
        user_id=str(current_user.id),
    )

    for item in data.items:
        product = product_rows.get(item.product_id)
        if not product:
            continue

        branch_stock = ensure_product_inventory(product)
        branch_name = data.branch
        branch_stock[branch_name] = max(int(branch_stock.get(branch_name, 0) or 0) - item.quantity, 0)
        product.branch_stock = json.dumps(branch_stock)
        product.stock_count = sum(int(value or 0) for value in branch_stock.values())
        product.in_stock = product.stock_count > 0

    await db.commit()

    if data.payment_method != "card":
        payment_label = PAYMENT_LABELS.get(data.payment_method, data.payment_method.replace("_", " ").title())
        return PaymentSessionResponse(
            order_id=created_order.id,
            tracking_number=created_order.tracking_number,
            status=created_order.status or status_value,
            payment_method=data.payment_method,
            subtotal=float(subtotal),
            shipping=float(shipping),
            discount=float(discount),
            total=float(total),
            deposit_amount=float(deposit_amount),
            pickup_time=data.pickup_time,
            message=f"{payment_label} order created successfully.",
        )

    if not _is_stripe_ready():
        await order_service.delete(created_order.id, user_id=str(current_user.id))
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured. Use MTN MoMo, Airtel Money or cash on delivery.",
        )

    stripe.api_key = getattr(settings, "stripe_secret_key", "") or os.environ.get("STRIPE_SECRET_KEY", "")

    try:
        amount = int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        success_url = data.success_url or _resolve_frontend_url("/payment-success?session_id={CHECKOUT_SESSION_ID}")
        cancel_url = _append_query_params(
            data.cancel_url or _resolve_frontend_url("/payment-cancel"),
            {
                "order_id": str(created_order.id),
                "tracking_number": tracking_number,
            },
        )
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": data.currency,
                        "product_data": {
                            "name": f"Simba order #{created_order.id}",
                        },
                        "unit_amount": amount,
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "order_id": str(created_order.id),
                "user_id": str(current_user.id),
                "tracking_number": tracking_number,
                "promo_code": (data.promo_code or "").strip().upper(),
            },
            client_reference_id=str(created_order.id),
        )
    except Exception as exc:
        logger.exception("Failed to create Stripe checkout session")
        await order_service.delete(created_order.id, user_id=str(current_user.id))
        raise HTTPException(status_code=500, detail=f"Failed to create Stripe checkout session: {exc}")

    return PaymentSessionResponse(
        order_id=created_order.id,
        tracking_number=created_order.tracking_number,
        status=created_order.status or status_value,
        payment_method=data.payment_method,
        subtotal=float(subtotal),
        shipping=float(shipping),
        discount=float(discount),
        total=float(total),
        deposit_amount=float(deposit_amount),
        pickup_time=data.pickup_time,
        session_id=session.id,
        url=getattr(session, "url", None),
        message="Redirecting to Stripe checkout.",
    )


@router.post("/verify_payment", response_model=VerifyPaymentResponse)
async def verify_payment(
    data: VerifyPaymentRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify a Stripe checkout session and mark the order as processing."""
    if not _is_stripe_ready():
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    stripe.api_key = getattr(settings, "stripe_secret_key", "") or os.environ.get("STRIPE_SECRET_KEY", "")

    try:
        session = stripe.checkout.Session.retrieve(data.session_id)
    except Exception as exc:
        logger.exception("Failed to retrieve Stripe checkout session")
        raise HTTPException(status_code=500, detail=f"Failed to verify payment: {exc}")

    order_id_raw = session.metadata.get("order_id")
    if not order_id_raw:
        raise HTTPException(status_code=400, detail="Payment session missing order metadata")

    order_service = OrdersService(db)
    order = await order_service.get_by_id(int(order_id_raw), user_id=str(current_user.id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    payment_status = getattr(session, "payment_status", "unpaid")
    status_value = "processing" if payment_status == "paid" else "awaiting_payment"

    updated = await order_service.update(
        order.id,
        {
            "status": status_value,
        },
        user_id=str(current_user.id),
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Order not found")

    return VerifyPaymentResponse(
        order_id=updated.id,
        tracking_number=updated.tracking_number,
        status=updated.status or status_value,
        payment_status=payment_status,
        total=float(updated.total or 0),
    )
