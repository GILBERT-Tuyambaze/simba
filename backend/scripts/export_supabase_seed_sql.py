import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Boolean, DateTime
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.schema import CreateIndex, CreateTable

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.database import Base  # noqa: E402

# Register all application tables with Base.metadata.
import models.auth  # noqa: F401,E402
import models.cart_items  # noqa: F401,E402
import models.invitations  # noqa: F401,E402
import models.orders  # noqa: F401,E402
import models.products  # noqa: F401,E402
import models.user_profiles  # noqa: F401,E402

DEFAULT_TABLES = [
    "users",
    "products",
    "user_profiles",
    "invitations",
    "orders",
    "cart_items",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export backend/local.db as a Supabase/Postgres seed SQL file.")
    parser.add_argument(
        "--source",
        default=str(BACKEND_ROOT / "local.db"),
        help="Path to the source SQLite database. Defaults to backend/local.db.",
    )
    parser.add_argument(
        "--output",
        default=str(BACKEND_ROOT / "logs" / "supabase_seed.sql"),
        help="Output SQL file. Defaults to backend/logs/supabase_seed.sql.",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        default=DEFAULT_TABLES,
        help="Tables to export. Defaults to the application data tables.",
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


def coerce_value(value: Any, column) -> Any:
    if value is None:
        return None

    if isinstance(column.type, Boolean):
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}
        return bool(value)

    if isinstance(column.type, DateTime) and isinstance(value, str):
        return parse_datetime(value)

    return value


def prepare_rows(rows: list[dict[str, Any]], table) -> list[dict[str, Any]]:
    columns = {column.name: column for column in table.columns}
    prepared = []
    for row in rows:
        item = {
            key: coerce_value(value, columns[key])
            for key, value in row.items()
            if key in columns
        }
        if item:
            prepared.append(item)
    return prepared


def compile_statement(statement) -> str:
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).rstrip()


def create_table_sql(table) -> str:
    statement = compile_statement(CreateTable(table, if_not_exists=True))
    index_sql = [
        compile_statement(CreateIndex(index, if_not_exists=True))
        for index in table.indexes
    ]
    return ";\n".join([statement, *index_sql]) + ";"


def upsert_sql(table, row: dict[str, Any]) -> str:
    primary_keys = [column.name for column in table.primary_key.columns]
    statement = postgres_insert(table).values(row)
    if primary_keys:
        update_columns = {
            column.name: getattr(statement.excluded, column.name)
            for column in table.columns
            if column.name not in primary_keys and column.name in row
        }
        if update_columns:
            statement = statement.on_conflict_do_update(
                index_elements=primary_keys,
                set_=update_columns,
            )
        else:
            statement = statement.on_conflict_do_nothing(index_elements=primary_keys)
    return compile_statement(statement) + ";"


def sequence_reset_sql(table) -> str:
    primary_keys = list(table.primary_key.columns)
    if len(primary_keys) != 1:
        return ""

    column = primary_keys[0]
    if not column.autoincrement:
        return ""

    table_name = table.name.replace("'", "''")
    column_name = column.name.replace("'", "''")
    return (
        "SELECT setval("
        f"pg_get_serial_sequence('{table_name}', '{column_name}'), "
        f"COALESCE((SELECT MAX(\"{column.name}\") FROM \"{table.name}\"), 1), "
        "true"
        ");"
    )


def main() -> int:
    args = parse_args()
    source = validate_source(Path(args.source))
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "-- Generated from backend/local.db for Supabase SQL Editor.",
        "-- Safe to rerun: rows are upserted by primary key.",
        "BEGIN;",
        "",
    ]

    for table_name in args.tables:
        table = Base.metadata.tables.get(table_name)
        if table is None:
            continue

        rows = prepare_rows(read_sqlite_rows(source, table_name), table)
        lines.append(f"-- {table_name}: {len(rows)} row(s)")
        lines.append(create_table_sql(table))
        for row in rows:
            lines.append(upsert_sql(table, row))
        reset_sql = sequence_reset_sql(table)
        if reset_sql:
            lines.append(reset_sql)
        lines.append("")

    lines.append("COMMIT;")
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
