import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.store_roles import normalize_store_role
from services.orders import OrdersService
from dependencies.auth import get_current_user
from models.user_profiles import User_profiles
from models.orders import Orders
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/orders", tags=["orders"])


async def _get_actor_profile(db: AsyncSession, user_id: str) -> Optional[User_profiles]:
    result = await db.execute(
        select(User_profiles)
        .where(User_profiles.user_id == user_id)
        .order_by(User_profiles.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _branch_matches(order: object, branch: Optional[str]) -> bool:
    if not branch:
        return False
    order_branch = str(getattr(order, "branch", "") or "").strip().lower()
    assigned_branch = str(getattr(order, "assigned_branch", "") or "").strip().lower()
    branch_value = branch.strip().lower()
    return order_branch == branch_value or assigned_branch == branch_value


def _can_access_order(order: object, current_user: UserResponse, actor_branch: Optional[str]) -> bool:
    actor_role = normalize_store_role(current_user.role)
    if actor_role == "super_admin":
        return True
    if actor_role in {"branch_manager", "branch_staff"}:
        return _branch_matches(order, actor_branch)
    if actor_role == "delivery_agent":
        return getattr(order, "assigned_delivery_agent_id", None) == str(current_user.id) or _branch_matches(order, actor_branch)
    return getattr(order, "user_id", None) == str(current_user.id)


def _validate_customer_order_update(order: object, update_dict: dict):
    allowed_fields = {"status", "rating", "review_comment", "review_branch"}
    if any(field not in allowed_fields for field in update_dict):
        raise HTTPException(status_code=403, detail="Customers can only cancel or review their own orders")

    if update_dict.get("status") == "cancelled":
        current_status = str(getattr(order, "status", "") or "").strip().lower()
        if current_status in {"shipped", "delivered", "cancelled"}:
            raise HTTPException(status_code=400, detail="This order can no longer be cancelled")

    if any(field in update_dict for field in {"rating", "review_comment", "review_branch"}):
        current_status = str(getattr(order, "status", "") or "").strip().lower()
        if current_status != "delivered":
            raise HTTPException(status_code=400, detail="Order review is only available after delivery")


# ---------- Pydantic Schemas ----------
class OrdersData(BaseModel):
    """Entity data schema (for create/update)"""
    customer_name: str = None
    branch: str = None
    assigned_branch: str = None
    items: str
    subtotal: float = None
    shipping: float = None
    discount: float = None
    deposit_amount: float = None
    total: float
    delivery_method: str = None
    delivery_option: str = None
    address: str = None
    phone: str = None
    payment_method: str = None
    status: str = None
    tracking_number: str = None
    pickup_time: str = None
    assigned_staff_id: str = None
    assigned_staff_name: str = None
    assigned_delivery_agent_id: str = None
    assigned_delivery_agent_name: str = None
    rating: int = None
    review_comment: str = None
    review_branch: str = None
    timeline: str = None
    created_at: str = None


class OrdersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    customer_name: Optional[str] = None
    branch: Optional[str] = None
    assigned_branch: Optional[str] = None
    items: Optional[str] = None
    subtotal: Optional[float] = None
    shipping: Optional[float] = None
    discount: Optional[float] = None
    deposit_amount: Optional[float] = None
    total: Optional[float] = None
    delivery_method: Optional[str] = None
    delivery_option: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    payment_method: Optional[str] = None
    status: Optional[str] = None
    tracking_number: Optional[str] = None
    pickup_time: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    assigned_delivery_agent_id: Optional[str] = None
    assigned_delivery_agent_name: Optional[str] = None
    rating: Optional[int] = None
    review_comment: Optional[str] = None
    review_branch: Optional[str] = None
    timeline: Optional[str] = None
    created_at: Optional[str] = None


class OrdersResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    customer_name: Optional[str] = None
    branch: Optional[str] = None
    assigned_branch: Optional[str] = None
    items: str
    subtotal: Optional[float] = None
    shipping: Optional[float] = None
    discount: Optional[float] = None
    deposit_amount: Optional[float] = None
    total: float
    delivery_method: Optional[str] = None
    delivery_option: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    payment_method: Optional[str] = None
    status: Optional[str] = None
    tracking_number: Optional[str] = None
    pickup_time: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    assigned_delivery_agent_id: Optional[str] = None
    assigned_delivery_agent_name: Optional[str] = None
    rating: Optional[int] = None
    review_comment: Optional[str] = None
    review_branch: Optional[str] = None
    timeline: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class OrdersListResponse(BaseModel):
    """List response schema"""
    items: List[OrdersResponse]
    total: int
    skip: int
    limit: int


class OrdersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[OrdersData]


class OrdersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: OrdersUpdateData


class OrdersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[OrdersBatchUpdateItem]


class OrdersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


class BranchReviewSummary(BaseModel):
    branch: str
    rating: float
    review_count: int
    recent_orders: int


class BranchReviewListResponse(BaseModel):
    items: List[BranchReviewSummary]


# ---------- Routes ----------
@router.get("", response_model=OrdersListResponse)
async def query_orderss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query orderss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying orderss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = OrdersService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} orderss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying orderss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=OrdersListResponse)
async def query_orderss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Query orderss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying orderss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = OrdersService(db)
    try:
        actor_role = normalize_store_role(current_user.role)
        if actor_role == "customer":
            raise HTTPException(status_code=403, detail="Dashboard order access is not available for customers")

        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        actor_profile = await _get_actor_profile(db, str(current_user.id))
        actor_branch = actor_profile.default_branch if actor_profile else None
        scoped_items = [
            item for item in result["items"] if _can_access_order(item, current_user, actor_branch)
        ]
        result["items"] = scoped_items
        result["total"] = len(scoped_items)
        logger.debug(f"Found {result['total']} orderss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying orderss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=OrdersResponse)
async def get_orders(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single orders by ID (user can only see their own records)"""
    logger.debug(f"Fetching orders with id: {id}, fields={fields}")
    
    service = OrdersService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Orders with id {id} not found")
            raise HTTPException(status_code=404, detail="Orders not found")
        actor_profile = await _get_actor_profile(db, str(current_user.id))
        actor_branch = actor_profile.default_branch if actor_profile else None
        if not _can_access_order(result, current_user, actor_branch):
            raise HTTPException(status_code=403, detail="You do not have access to this order")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching orders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=OrdersResponse, status_code=201)
async def create_orders(
    data: OrdersData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new orders"""
    logger.debug(f"Creating new orders with data: {data}")
    
    service = OrdersService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create orders")
        
        logger.info(f"Orders created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating orders: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating orders: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[OrdersResponse], status_code=201)
async def create_orderss_batch(
    request: OrdersBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple orderss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} orderss")
    
    service = OrdersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} orderss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[OrdersResponse])
async def update_orderss_batch(
    request: OrdersBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple orderss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} orderss")
    
    service = OrdersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} orderss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=OrdersResponse)
async def update_orders(
    id: int,
    data: OrdersUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing orders (requires ownership)"""
    logger.debug(f"Updating orders {id} with data: {data}")

    service = OrdersService(db)
    try:
        existing = await service.get_by_id(id)
        if not existing:
            logger.warning(f"Orders with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Orders not found")

        actor_profile = await _get_actor_profile(db, str(current_user.id))
        actor_branch = actor_profile.default_branch if actor_profile else None
        if not _can_access_order(existing, current_user, actor_branch):
            raise HTTPException(status_code=403, detail="You do not have access to this order")

        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        if normalize_store_role(current_user.role) == "customer":
            _validate_customer_order_update(existing, update_dict)
            result = await service.update(id, update_dict, user_id=str(current_user.id))
        else:
            result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Orders with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Orders not found")
        
        logger.info(f"Orders {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating orders {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating orders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_orderss_batch(
    request: OrdersBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple orderss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} orderss")
    
    service = OrdersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} orderss successfully")
        return {"message": f"Successfully deleted {deleted_count} orderss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_orders(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single orders by ID (requires ownership)"""
    logger.debug(f"Deleting orders with id: {id}")
    
    service = OrdersService(db)
    try:
        existing = await service.get_by_id(id)
        if not existing:
            logger.warning(f"Orders with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Orders not found")
        actor_profile = await _get_actor_profile(db, str(current_user.id))
        actor_branch = actor_profile.default_branch if actor_profile else None
        if not _can_access_order(existing, current_user, actor_branch):
            raise HTTPException(status_code=403, detail="You do not have access to this order")

        success = await service.delete(
            id,
            user_id=str(current_user.id) if normalize_store_role(current_user.role) == "customer" else None,
        )
        if not success:
            logger.warning(f"Orders with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Orders not found")
        
        logger.info(f"Orders {id} deleted successfully")
        return {"message": "Orders deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting orders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/branch-summary", response_model=BranchReviewListResponse)
async def branch_summary(
    db: AsyncSession = Depends(get_db),
):
    """Public aggregate branch review summary for selectors and checkout."""
    result = await db.execute(select(Orders))
    items = result.scalars().all()

    stats: dict[str, dict[str, float | int]] = {}
    for order in items:
        branch_name = str(getattr(order, "review_branch", None) or getattr(order, "branch", None) or getattr(order, "assigned_branch", None) or "").strip()
        if not branch_name:
            continue

        bucket = stats.setdefault(branch_name, {"rating_total": 0.0, "review_count": 0, "recent_orders": 0})
        bucket["recent_orders"] = int(bucket["recent_orders"]) + 1

        rating_value = getattr(order, "rating", None)
        if rating_value is not None:
            bucket["rating_total"] = float(bucket["rating_total"]) + float(rating_value)
            bucket["review_count"] = int(bucket["review_count"]) + 1

    summaries = [
        BranchReviewSummary(
            branch=branch,
            rating=round(float(data["rating_total"]) / int(data["review_count"]), 2) if int(data["review_count"]) else 0.0,
            review_count=int(data["review_count"]),
            recent_orders=int(data["recent_orders"]),
        )
        for branch, data in sorted(stats.items(), key=lambda item: item[0])
    ]

    return BranchReviewListResponse(items=summaries)
