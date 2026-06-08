from core.database import DatabaseManager


def test_hosted_postgres_defaults_to_ssl(monkeypatch):
    monkeypatch.delenv("DATABASE_SSL", raising=False)
    monkeypatch.delenv("PGSSLMODE", raising=False)

    manager = DatabaseManager()

    assert manager._postgres_connect_args("postgresql://user:pass@db.example.com:5432/app") == {"ssl": "require"}


def test_local_postgres_does_not_default_to_ssl(monkeypatch):
    monkeypatch.delenv("DATABASE_SSL", raising=False)
    monkeypatch.delenv("PGSSLMODE", raising=False)

    manager = DatabaseManager()

    assert manager._postgres_connect_args("postgresql://user:pass@localhost:5432/app") == {}


def test_sslmode_require_enables_ssl(monkeypatch):
    monkeypatch.delenv("DATABASE_SSL", raising=False)
    monkeypatch.delenv("PGSSLMODE", raising=False)

    manager = DatabaseManager()

    assert manager._postgres_connect_args("postgresql://user:pass@localhost:5432/app?sslmode=require") == {"ssl": "require"}


def test_database_ssl_env_can_disable_hosted_default(monkeypatch):
    monkeypatch.setenv("DATABASE_SSL", "false")
    monkeypatch.delenv("PGSSLMODE", raising=False)

    manager = DatabaseManager()

    assert manager._postgres_connect_args("postgresql://user:pass@db.example.com:5432/app") == {}


def test_ssl_query_params_are_removed_from_asyncpg_url():
    manager = DatabaseManager()

    normalized = manager._normalize_async_database_url(
        "postgresql://user:pass@db.example.com:5432/app?sslmode=require&channel_binding=require"
    )

    assert normalized == "postgresql+asyncpg://user:pass@db.example.com:5432/app"
