import argparse
import asyncio
import logging
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import Boolean, Date, DateTime, Integer, MetaData, Table, func, select, text
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env", override=False)

from core.config import settings  # noqa: E402
from core.database import Base, db_manager  # noqa: E402

# Register all application tables with Base.metadata before create_all().
import models.auth  # noqa: F401,E402
import models.cart_items  # noqa: F401,E402
import models.invitations  # noqa: F401,E402
import models.orders  # noqa: F401,E402
import models.products  # noqa: F401,E402
import models.user_profiles  # noqa: F401,E402

logger = logging.getLogger("seed_supabase_from_sqlite")

DEFAULT_TABLES = [
    "users",
    "products",
    "user_profiles",
    "invitations",
    "orders",
    "cart_items",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Supabase/Postgres from the local SQLite database.")
    parser.add_argument(
        "--source",
        default=str(BACKEND_ROOT / "local.db"),
        help="Path to the source SQLite database. Defaults to backend/local.db.",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        default=DEFAULT_TABLES,
        help="Tables to copy. Defaults to the application data tables.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read source counts and connect to the target without inserting rows.",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Delete target table rows before inserting. Use only when you want Supabase to exactly match local data.",
    )
    return parser.parse_args()


def validate_source(source: Path) -> Path:
    resolved = source.expanduser().resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"SQLite source database not found: {resolved}")
    if not resolved.is_file():
        raise ValueError(f"SQLite source path is not a file: {resolved}")
    return resolved


def sqlite_table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def read_sqlite_rows(source: Path, table_name: str) -> list[dict[str, Any]]:
    with sqlite3.connect(source) as connection:
        connection.row_factory = sqlite3.Row
        if not sqlite_table_exists(connection, table_name):
            logger.warning("Skipping %s because it is missing from %s", table_name, source)
            return []

        rows = connection.execute(f'SELECT * FROM "{table_name}"').fetchall()
        return [dict(row) for row in rows]


def parse_datetime(value: str) -> datetime | str:
    normalized = value.replace("Z", "+00:00")
    for parser in (
        datetime.fromisoformat,
        lambda raw: datetime.strptime(raw, "%Y-%m-%d %H:%M:%S.%f"),
        lambda raw: datetime.strptime(raw, "%Y-%m-%d %H:%M:%S"),
    ):
        try:
            return parser(normalized)
        except ValueError:
            continue
    return value


def parse_date(value: str) -> date | str:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return value


def coerce_value(value: Any, column) -> Any:
    if value is None:
        return None

    column_type = column.type
    if isinstance(column_type, Boolean):
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}
        return bool(value)

    if isinstance(column_type, DateTime) and isinstance(value, str):
        return parse_datetime(value)

    if isinstance(column_type, Date) and isinstance(value, str):
        return parse_date(value)

    return value


def prepare_rows(rows: list[dict[str, Any]], table: Table) -> list[dict[str, Any]]:
    columns = {column.name: column for column in table.columns}
    prepared: list[dict[str, Any]] = []

    for row in rows:
        prepared_row = {
            key: coerce_value(value, columns[key])
            for key, value in row.items()
            if key in columns
        }
        if prepared_row:
            prepared.append(prepared_row)

    return prepared


def quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


async def reflect_table(connection, table_name: str) -> Table:
    def reflect(sync_connection):
        metadata = MetaData()
        return Table(table_name, metadata, autoload_with=sync_connection)

    return await connection.run_sync(reflect)


async def reset_sequence(connection, table: Table) -> None:
    primary_keys = list(table.primary_key.columns)
    if len(primary_keys) != 1:
        return

    primary_key = primary_keys[0]
    if not isinstance(primary_key.type, Integer):
        return

    table_name = table.name
    column_name = primary_key.name
    quoted_table = quote_identifier(table_name)
    quoted_column = quote_identifier(column_name)

    sequence_name = await connection.scalar(
        text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
        {"table_name": table_name, "column_name": column_name},
    )
    if not sequence_name:
        return

    max_id = await connection.scalar(text(f"SELECT MAX({quoted_column}) FROM {quoted_table}"))
    if max_id is None:
        await connection.execute(text("SELECT setval(:sequence_name, 1, false)"), {"sequence_name": sequence_name})
        return

    await connection.execute(text("SELECT setval(:sequence_name, :max_id, true)"), {"sequence_name": sequence_name, "max_id": max_id})


async def seed_table(connection, source: Path, table_name: str, truncate: bool, dry_run: bool) -> int:
    source_rows = read_sqlite_rows(source, table_name)
    source_count = len(source_rows)
    try:
        table = await reflect_table(connection, table_name)
    except NoSuchTableError:
        if dry_run:
            logger.warning("%s: source=%d target_missing=true", table_name, source_count)
            return source_count
        raise

    target_count = await connection.scalar(select(func.count()).select_from(table))

    logger.info("%s: source=%d target_before=%d", table_name, source_count, target_count or 0)
    if dry_run or source_count == 0:
        return source_count

    rows = prepare_rows(source_rows, table)
    if not rows:
        logger.warning("%s: no compatible rows after column filtering", table_name)
        return 0

    if truncate:
        await connection.execute(text(f"DELETE FROM {quote_identifier(table_name)}"))

    primary_keys = [column.name for column in table.primary_key.columns]
    statement = postgres_insert(table).values(rows)
    if primary_keys:
        update_columns = {
            column.name: getattr(statement.excluded, column.name)
            for column in table.columns
            if column.name not in primary_keys
        }
        if update_columns:
            statement = statement.on_conflict_do_update(
                index_elements=primary_keys,
                set_=update_columns,
            )
        else:
            statement = statement.on_conflict_do_nothing(index_elements=primary_keys)

    await connection.execute(statement)
    await reset_sequence(connection, table)

    target_after = await connection.scalar(select(func.count()).select_from(table))
    logger.info("%s: seeded=%d target_after=%d", table_name, len(rows), target_after or 0)
    return len(rows)


async def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    source = validate_source(Path(args.source))
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured in the backend environment.")

    database_url = db_manager._normalize_async_database_url(settings.database_url)
    engine_kwargs: dict[str, Any] = {"echo": False}
    connect_args = db_manager._postgres_connect_args(settings.database_url)
    if connect_args:
        engine_kwargs["connect_args"] = connect_args

    engine = create_async_engine(database_url, **engine_kwargs)
    try:
        async with engine.begin() as connection:
            known_tables = [
                Base.metadata.tables[table_name]
                for table_name in args.tables
                if table_name in Base.metadata.tables
            ]
            if args.dry_run:
                logger.info("Dry run mode: target schema will not be created or changed.")
            else:
                await connection.run_sync(Base.metadata.create_all, tables=known_tables)
            total = 0
            for table_name in args.tables:
                if table_name not in Base.metadata.tables:
                    logger.warning("Skipping unknown application table: %s", table_name)
                    continue
                total += await seed_table(connection, source, table_name, args.truncate, args.dry_run)

        if args.dry_run:
            logger.info("Dry run completed. No rows were written.")
        else:
            logger.info("Seed completed. Rows processed: %d", total)
    finally:
        await engine.dispose()

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
