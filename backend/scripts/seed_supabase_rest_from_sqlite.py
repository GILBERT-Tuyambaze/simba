import argparse
import json
import logging
import os
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env", override=False)

logger = logging.getLogger("seed_supabase_rest_from_sqlite")

DEFAULT_TABLES = [
    "users",
    "products",
    "user_profiles",
    "invitations",
    "orders",
    "cart_items",
]

DEFAULT_BATCH_SIZE = 500


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Supabase Data API from the local SQLite database.")
    parser.add_argument(
        "--source",
        default=str(BACKEND_ROOT / "local.db"),
        help="Path to the source SQLite database. Defaults to backend/local.db.",
    )
    parser.add_argument(
        "--supabase-url",
        default=os.environ.get("SUPABASE_URL", ""),
        help="Supabase project URL, for example https://project-ref.supabase.co.",
    )
    parser.add_argument(
        "--secret-key",
        default=os.environ.get("SUPABASE_SECRET_KEY", ""),
        help="Supabase secret key. Prefer setting SUPABASE_SECRET_KEY instead of passing this in the shell.",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        default=DEFAULT_TABLES,
        help="Tables to copy. Defaults to the application data tables.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Rows per REST upsert request. Defaults to {DEFAULT_BATCH_SIZE}.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read local rows and remote counts without inserting data.",
    )
    return parser.parse_args()


def normalize_supabase_url(value: str) -> str:
    url = value.strip().rstrip("/")
    if not url:
        raise ValueError("SUPABASE_URL is required.")
    if not url.startswith(("https://", "http://")):
        raise ValueError("SUPABASE_URL must start with https:// or http://.")
    return url


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


def chunked(rows: list[dict[str, Any]], batch_size: int):
    for index in range(0, len(rows), batch_size):
        yield rows[index : index + batch_size]


class SupabaseRestClient:
    def __init__(self, supabase_url: str, secret_key: str):
        if not secret_key:
            raise ValueError("SUPABASE_SECRET_KEY is required.")

        self.base_url = normalize_supabase_url(supabase_url)
        self.secret_key = secret_key.strip()

    def request(self, method: str, path: str, body: Any = None, extra_headers: dict[str, str] | None = None):
        url = f"{self.base_url}/rest/v1/{path.lstrip('/')}"
        data = None
        headers = {
            "apikey": self.secret_key,
            "Content-Type": "application/json",
            "User-Agent": "simba-backend-seed/1.0",
        }
        if extra_headers:
            headers.update(extra_headers)
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")

        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = response.read().decode("utf-8")
                if not payload:
                    return None
                return json.loads(payload)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed with HTTP {exc.code}: {detail}") from exc

    def count(self, table_name: str) -> int:
        quoted_table = urllib.parse.quote(table_name, safe="")
        path = f"{quoted_table}?select=id&limit=1"
        url = f"{self.base_url}/rest/v1/{path}"
        request = urllib.request.Request(
            url,
            headers={
                "apikey": self.secret_key,
                "Prefer": "count=exact",
                "Range": "0-0",
                "User-Agent": "simba-backend-seed/1.0",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                content_range = response.headers.get("Content-Range", "0-0/0")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"GET {table_name} count failed with HTTP {exc.code}: {detail}") from exc

        try:
            return int(content_range.rsplit("/", 1)[1])
        except (IndexError, ValueError):
            return 0

    def upsert(self, table_name: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return

        quoted_table = urllib.parse.quote(table_name, safe="")
        self.request(
            "POST",
            f"{quoted_table}?on_conflict=id",
            body=rows,
            extra_headers={
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )


def seed_table(
    client: SupabaseRestClient,
    source: Path,
    table_name: str,
    batch_size: int,
    dry_run: bool,
) -> int:
    rows = read_sqlite_rows(source, table_name)
    source_count = len(rows)
    target_before = client.count(table_name)
    logger.info("%s: source=%d target_before=%d", table_name, source_count, target_before)

    if dry_run or not rows:
        return source_count

    for batch in chunked(rows, batch_size):
        client.upsert(table_name, batch)

    target_after = client.count(table_name)
    logger.info("%s: seeded=%d target_after=%d", table_name, source_count, target_after)
    return source_count


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    source = validate_source(Path(args.source))
    client = SupabaseRestClient(args.supabase_url, args.secret_key)

    total = 0
    for table_name in args.tables:
        total += seed_table(client, source, table_name, args.batch_size, args.dry_run)

    if args.dry_run:
        logger.info("Dry run completed. No rows were written.")
    else:
        logger.info("Seed completed. Rows processed: %d", total)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
