import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.catalog_assistant import CatalogAssistantService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/catalog-assistant", tags=["catalog-assistant"])


class CatalogAssistantSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=240)
    limit: int = Field(8, ge=1, le=12)


class CatalogAssistantSearchResponse(BaseModel):
    message: str
    product_ids: list[int]
    source: Literal["groq", "local"]


@router.post("/search", response_model=CatalogAssistantSearchResponse)
async def search_catalog(
    request: CatalogAssistantSearchRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        service = CatalogAssistantService(db)
        return await service.search(request.query, request.limit)
    except Exception as exc:
        logger.error("Catalog assistant search failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Catalog assistant search failed.",
        ) from exc
