import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.cart_items import Cart_items

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Cart_itemsService:
    """Service layer for Cart_items operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Cart_items]:
        """Create a new cart_items"""
        try:
            if user_id:
                data['user_id'] = user_id
            obj = Cart_items(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created cart_items with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating cart_items: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for cart_items {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Cart_items]:
        """Get cart_items by ID (user can only see their own records)"""
        try:
            query = select(Cart_items).where(Cart_items.id == obj_id)
            if user_id:
                query = query.where(Cart_items.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching cart_items {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of cart_itemss (user can only see their own records)"""
        try:
            query = select(Cart_items)
            count_query = select(func.count(Cart_items.id))
            
            if user_id:
                query = query.where(Cart_items.user_id == user_id)
                count_query = count_query.where(Cart_items.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Cart_items, field):
                        query = query.where(getattr(Cart_items, field) == value)
                        count_query = count_query.where(getattr(Cart_items, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Cart_items, field_name):
                        query = query.order_by(getattr(Cart_items, field_name).desc())
                else:
                    if hasattr(Cart_items, sort):
                        query = query.order_by(getattr(Cart_items, sort))
            else:
                query = query.order_by(Cart_items.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching cart_items list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Cart_items]:
        """Update cart_items (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Cart_items {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated cart_items {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating cart_items {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete cart_items (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Cart_items {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted cart_items {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting cart_items {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Cart_items]:
        """Get cart_items by any field"""
        try:
            if not hasattr(Cart_items, field_name):
                raise ValueError(f"Field {field_name} does not exist on Cart_items")
            result = await self.db.execute(
                select(Cart_items).where(getattr(Cart_items, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching cart_items by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Cart_items]:
        """Get list of cart_itemss filtered by field"""
        try:
            if not hasattr(Cart_items, field_name):
                raise ValueError(f"Field {field_name} does not exist on Cart_items")
            result = await self.db.execute(
                select(Cart_items)
                .where(getattr(Cart_items, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Cart_items.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching cart_itemss by {field_name}: {str(e)}")
            raise