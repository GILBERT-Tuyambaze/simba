import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.store_roles import can_access_dashboard
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


CREATE_SITE_VISITS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS site_visits (
    client_key VARCHAR(128) NOT NULL,
    visit_day DATE NOT NULL,
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    path TEXT NULL,
    referrer TEXT NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (client_key, visit_day)
)
"""


class VisitRecordRequest(BaseModel):
    client_key: str
    path: str | None = None
    referrer: str | None = None


class VisitSummaryResponse(BaseModel):
    total_visits: int
    visits_today: int
    visits_last_7_days: int
    visits_last_30_days: int
    visits_last_90_days: int


async def ensure_site_visits_table(db: AsyncSession) -> None:
    await db.execute(text(CREATE_SITE_VISITS_TABLE_SQL))
    await db.commit()


def normalize_client_key(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("client key is required")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@router.post("/visit", status_code=status.HTTP_202_ACCEPTED)
async def record_site_visit(
    payload: VisitRecordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        client_key = normalize_client_key(payload.client_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await ensure_site_visits_table(db)

    today = datetime.now(UTC).date()
    user_agent = request.headers.get("user-agent", "")[:512]
    path = (payload.path or "/").strip()[:2048] or "/"
    referrer = (payload.referrer or "").strip()[:2048] or None

    upsert_sql = text(
        """
        INSERT INTO site_visits (client_key, visit_day, path, referrer, user_agent)
        VALUES (:client_key, :visit_day, :path, :referrer, :user_agent)
        ON CONFLICT (client_key, visit_day)
        DO UPDATE SET
            last_seen_at = CURRENT_TIMESTAMP,
            path = EXCLUDED.path,
            referrer = EXCLUDED.referrer,
            user_agent = EXCLUDED.user_agent
        """
    )
    await db.execute(
        upsert_sql,
        {
            "client_key": client_key,
            "visit_day": today,
            "path": path,
            "referrer": referrer,
            "user_agent": user_agent,
        },
    )
    await db.commit()
    return {"status": "accepted"}


@router.get("/summary", response_model=VisitSummaryResponse)
async def get_visit_summary(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not can_access_dashboard(current_user.role):
        raise HTTPException(status_code=403, detail="Dashboard analytics are not available for customers")

    await ensure_site_visits_table(db)

    today = datetime.now(UTC).date()
    last_7_days = today - timedelta(days=6)
    last_30_days = today - timedelta(days=29)
    last_90_days = today - timedelta(days=89)

    summary_sql = text(
        """
        SELECT
            COUNT(*) AS total_visits,
            SUM(CASE WHEN visit_day = :today THEN 1 ELSE 0 END) AS visits_today,
            SUM(CASE WHEN visit_day >= :last_7_days THEN 1 ELSE 0 END) AS visits_last_7_days,
            SUM(CASE WHEN visit_day >= :last_30_days THEN 1 ELSE 0 END) AS visits_last_30_days,
            SUM(CASE WHEN visit_day >= :last_90_days THEN 1 ELSE 0 END) AS visits_last_90_days
        FROM site_visits
        """
    )
    result = await db.execute(
        summary_sql,
        {
            "today": today,
            "last_7_days": last_7_days,
            "last_30_days": last_30_days,
            "last_90_days": last_90_days,
        },
    )
    row = result.mappings().one()
    return VisitSummaryResponse(
        total_visits=int(row["total_visits"] or 0),
        visits_today=int(row["visits_today"] or 0),
        visits_last_7_days=int(row["visits_last_7_days"] or 0),
        visits_last_30_days=int(row["visits_last_30_days"] or 0),
        visits_last_90_days=int(row["visits_last_90_days"] or 0),
    )
