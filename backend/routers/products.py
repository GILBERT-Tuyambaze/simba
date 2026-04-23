import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.inventory import ensure_product_inventory
from core.store_roles import can_manage_products, is_branch_scoped
from dependencies.auth import get_current_user
from models.user_profiles import User_profiles
from schemas.auth import UserResponse
from services.products import ProductsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/products", tags=["products"])


async def _hydrate_inventory(items: list, db: AsyncSession):
    changed = False
    for item in items:
        before_stock = getattr(item, "stock_count", None)
        before_branch_stock = getattr(item, "branch_stock", None)
        ensure_product_inventory(item)
        if before_stock != item.stock_count or before_branch_stock != item.branch_stock:
            changed = True

    if changed:
        await db.commit()


async def _get_actor_branch(db: AsyncSession, user_id: str) -> Optional[str]:
    result = await db.execute(
        select(User_profiles)
        .where(User_profiles.user_id == user_id)
        .order_by(User_profiles.id.desc())
        .limit(1)
    )
    profile = result.scalar_one_or_none()
    return profile.default_branch if profile else None


async def _require_product_access(current_user: UserResponse, db: AsyncSession, branch: Optional[str]) -> Optional[str]:
    if not can_manage_products(current_user.role):
        raise HTTPException(status_code=403, detail="You do not have permission to manage products")

    if is_branch_scoped(current_user.role):
        actor_branch = await _get_actor_branch(db, str(current_user.id))
        if not actor_branch:
            raise HTTPException(status_code=400, detail="Your account is missing an assigned branch")
        if branch and branch != actor_branch:
            raise HTTPException(status_code=403, detail="You can only manage products in your assigned branch")
        return actor_branch

    return branch


# ---------- Pydantic Schemas ----------
class ProductsData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    price: float
    category: str
    subcategory_id: int = None
    in_stock: bool = None
    image: str = None
    unit: str = None
    description: str = None
    brand: str = None
    rating: float = None
    discount: int = None
    branch: str = None
    available_for_delivery: bool = None
    stock_count: int = None
    branch_stock: str = None
    tags: str = None
    attributes: str = None
    variations: str = None
    options: str = None
    addons: str = None
    modifiers: str = None
    upsells: str = None
    cross_sells: str = None
    related_products: str = None
    recommended_products: str = None
    similar_products: str = None
    frequently_bought_together: str = None
    best_seller: bool = None
    new_arrival: bool = None
    featured: bool = None
    on_sale: bool = None
    out_of_stock: bool = None
    low_stock: bool = None
    backorder: bool = None
    pre_order: bool = None
    discontinued: bool = None


class ProductsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    subcategory_id: Optional[int] = None
    in_stock: Optional[bool] = None
    image: Optional[str] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    rating: Optional[float] = None
    discount: Optional[int] = None
    branch: Optional[str] = None
    available_for_delivery: Optional[bool] = None
    stock_count: Optional[int] = None
    branch_stock: Optional[str] = None
    tags: Optional[str] = None
    attributes: Optional[str] = None
    variations: Optional[str] = None
    options: Optional[str] = None
    addons: Optional[str] = None
    modifiers: Optional[str] = None
    upsells: Optional[str] = None
    cross_sells: Optional[str] = None
    related_products: Optional[str] = None
    recommended_products: Optional[str] = None
    similar_products: Optional[str] = None
    frequently_bought_together: Optional[str] = None
    best_seller: Optional[bool] = None
    new_arrival: Optional[bool] = None
    featured: Optional[bool] = None
    on_sale: Optional[bool] = None
    out_of_stock: Optional[bool] = None
    low_stock: Optional[bool] = None
    backorder: Optional[bool] = None
    pre_order: Optional[bool] = None
    discontinued: Optional[bool] = None


class ProductsResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: str
    price: float
    category: str
    subcategory_id: Optional[int] = None
    in_stock: Optional[bool] = None
    image: Optional[str] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    rating: Optional[float] = None
    discount: Optional[int] = None
    branch: Optional[str] = None
    available_for_delivery: Optional[bool] = None
    stock_count: Optional[int] = None
    branch_stock: Optional[str] = None
    tags: Optional[str] = None
    attributes: Optional[str] = None
    variations: Optional[str] = None
    options: Optional[str] = None
    addons: Optional[str] = None
    modifiers: Optional[str] = None
    upsells: Optional[str] = None
    cross_sells: Optional[str] = None
    related_products: Optional[str] = None
    recommended_products: Optional[str] = None
    similar_products: Optional[str] = None
    frequently_bought_together: Optional[str] = None
    best_seller: Optional[bool] = None
    new_arrival: Optional[bool] = None
    featured: Optional[bool] = None
    on_sale: Optional[bool] = None
    out_of_stock: Optional[bool] = None
    low_stock: Optional[bool] = None
    backorder: Optional[bool] = None
    pre_order: Optional[bool] = None
    discontinued: Optional[bool] = None

    class Config:
        from_attributes = True


class ProductsListResponse(BaseModel):
    """List response schema"""
    items: List[ProductsResponse]
    total: int
    skip: int
    limit: int


class ProductsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[ProductsData]


class ProductsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: ProductsUpdateData


class ProductsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[ProductsBatchUpdateItem]


class ProductsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=ProductsListResponse)
async def query_productss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query productss with filtering, sorting, and pagination"""
    logger.debug(f"Querying productss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = ProductsService(db)
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
        )
        await _hydrate_inventory(result["items"], db)
        logger.debug(f"Found {result['total']} productss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying productss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=ProductsListResponse)
async def query_productss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query productss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying productss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = ProductsService(db)
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
            sort=sort
        )
        await _hydrate_inventory(result["items"], db)
        logger.debug(f"Found {result['total']} productss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying productss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=ProductsResponse)
async def get_products(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single products by ID"""
    logger.debug(f"Fetching products with id: {id}, fields={fields}")
    
    service = ProductsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Products with id {id} not found")
            raise HTTPException(status_code=404, detail="Products not found")
        ensure_product_inventory(result)
        await db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching products {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=ProductsResponse, status_code=201)
async def create_products(
    data: ProductsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new products"""
    logger.debug(f"Creating new products with data: {data}")
    
    service = ProductsService(db)
    try:
        payload = data.model_dump()
        payload["branch"] = await _require_product_access(current_user, db, data.branch)
        result = await service.create(payload)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create products")
        
        logger.info(f"Products created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating products: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating products: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[ProductsResponse], status_code=201)
async def create_productss_batch(
    request: ProductsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple productss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} productss")
    
    service = ProductsService(db)
    results = []
    
    try:
        for item_data in request.items:
            payload = item_data.model_dump()
            payload["branch"] = await _require_product_access(current_user, db, item_data.branch)
            result = await service.create(payload)
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} productss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[ProductsResponse])
async def update_productss_batch(
    request: ProductsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple productss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} productss")
    
    service = ProductsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            existing = await service.get_by_id(item.id)
            if not existing:
                continue
            await _require_product_access(current_user, db, update_dict.get("branch") or existing.branch)
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} productss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=ProductsResponse)
async def update_products(
    id: int,
    data: ProductsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing products"""
    logger.debug(f"Updating products {id} with data: {data}")

    service = ProductsService(db)
    try:
        existing = await service.get_by_id(id)
        if not existing:
            logger.warning(f"Products with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Products not found")
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        await _require_product_access(current_user, db, update_dict.get("branch") or existing.branch)
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Products with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Products not found")
        
        logger.info(f"Products {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating products {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating products {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_productss_batch(
    request: ProductsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple productss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} productss")
    
    service = ProductsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            existing = await service.get_by_id(item_id)
            if existing:
                await _require_product_access(current_user, db, existing.branch)
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} productss successfully")
        return {"message": f"Successfully deleted {deleted_count} productss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_products(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single products by ID"""
    logger.debug(f"Deleting products with id: {id}")
    
    service = ProductsService(db)
    try:
        existing = await service.get_by_id(id)
        if existing:
            await _require_product_access(current_user, db, existing.branch)
        success = await service.delete(id)
        if not success:
            logger.warning(f"Products with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Products not found")
        
        logger.info(f"Products {id} deleted successfully")
        return {"message": "Products deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting products {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
