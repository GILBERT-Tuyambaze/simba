import json
import logging
from typing import List, Optional


from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.cart_items import Cart_itemsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/cart_items", tags=["cart_items"])


# ---------- Pydantic Schemas ----------
class Cart_itemsData(BaseModel):
    """Entity data schema (for create/update)"""
    product_id: int
    product_name: str = None
    price: float = None
    image: str = None
    quantity: int
    branch: str = None
    created_at: str = None


class Cart_itemsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    price: Optional[float] = None
    image: Optional[str] = None
    quantity: Optional[int] = None
    branch: Optional[str] = None
    created_at: Optional[str] = None


class Cart_itemsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    product_id: int
    product_name: Optional[str] = None
    price: Optional[float] = None
    image: Optional[str] = None
    quantity: int
    branch: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class Cart_itemsListResponse(BaseModel):
    """List response schema"""
    items: List[Cart_itemsResponse]
    total: int
    skip: int
    limit: int


class Cart_itemsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Cart_itemsData]


class Cart_itemsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Cart_itemsUpdateData


class Cart_itemsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Cart_itemsBatchUpdateItem]


class Cart_itemsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Cart_itemsListResponse)
async def query_cart_itemss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query cart_itemss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying cart_itemss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Cart_itemsService(db)
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
        logger.debug(f"Found {result['total']} cart_itemss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying cart_itemss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Cart_itemsListResponse)
async def query_cart_itemss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query cart_itemss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying cart_itemss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Cart_itemsService(db)
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
        logger.debug(f"Found {result['total']} cart_itemss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying cart_itemss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Cart_itemsResponse)
async def get_cart_items(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single cart_items by ID (user can only see their own records)"""
    logger.debug(f"Fetching cart_items with id: {id}, fields={fields}")
    
    service = Cart_itemsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Cart_items with id {id} not found")
            raise HTTPException(status_code=404, detail="Cart_items not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching cart_items {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Cart_itemsResponse, status_code=201)
async def create_cart_items(
    data: Cart_itemsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new cart_items"""
    logger.debug(f"Creating new cart_items with data: {data}")
    
    service = Cart_itemsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create cart_items")
        
        logger.info(f"Cart_items created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating cart_items: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating cart_items: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Cart_itemsResponse], status_code=201)
async def create_cart_itemss_batch(
    request: Cart_itemsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple cart_itemss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} cart_itemss")
    
    service = Cart_itemsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} cart_itemss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Cart_itemsResponse])
async def update_cart_itemss_batch(
    request: Cart_itemsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple cart_itemss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} cart_itemss")
    
    service = Cart_itemsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} cart_itemss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Cart_itemsResponse)
async def update_cart_items(
    id: int,
    data: Cart_itemsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing cart_items (requires ownership)"""
    logger.debug(f"Updating cart_items {id} with data: {data}")

    service = Cart_itemsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Cart_items with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Cart_items not found")
        
        logger.info(f"Cart_items {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating cart_items {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating cart_items {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_cart_itemss_batch(
    request: Cart_itemsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple cart_itemss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} cart_itemss")
    
    service = Cart_itemsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} cart_itemss successfully")
        return {"message": f"Successfully deleted {deleted_count} cart_itemss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_cart_items(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single cart_items by ID (requires ownership)"""
    logger.debug(f"Deleting cart_items with id: {id}")
    
    service = Cart_itemsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Cart_items with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Cart_items not found")
        
        logger.info(f"Cart_items {id} deleted successfully")
        return {"message": "Cart_items deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cart_items {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")