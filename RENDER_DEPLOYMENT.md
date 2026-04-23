# Render Deployment Guide for Simba Backend

## What the Current Error Means

Your latest Render log is not failing during build. It fails during application startup when FastAPI initializes the database:

```text
socket.gaierror: [Errno -2] Name or service not known
```

That means the backend is trying to open a PostgreSQL connection, but the hostname in `DATABASE_URL` is not resolving correctly in Render.

## What to Fix

### If You Use Render Postgres

Use Render's internal database URL and convert it to async SQLAlchemy format:

```text
postgresql+asyncpg://username:password@hostname:5432/database_name
```

### If You Use Supabase Postgres

Do **not** use the direct connection host on Render:

```text
db.<project-ref>.supabase.co:5432
```

For Render, use the **Supabase Session Pooler** connection string instead, then change the scheme to:

```text
postgresql+asyncpg://
```

Example shape:

```text
postgresql+asyncpg://postgres.<project-ref>:password@aws-0-<region>.pooler.supabase.com:5432/postgres
```

## Render Environment Variables

In Render, set `DATABASE_URL` in the backend service settings:

1. Open your backend service.
2. Go to **Settings** -> **Environment**.
3. Set:

```text
DATABASE_URL=postgresql+asyncpg://...
```

Also make sure the other required variables are present:

```text
DEBUG=false
FIREBASE_PROJECT_ID=...
FIREBASE_SERVICE_ACCOUNT_JSON=...
JWT_SECRET_KEY=...
STRIPE_SECRET_KEY=...
```

## Important Password Rule

If the password contains reserved URL characters such as `@`, `:`, `/`, or `#`, URL-encode it inside `DATABASE_URL`.

Example:

```text
abc@123
```

must become:

```text
abc%40123
```

## Redeploy Steps

1. Save the corrected environment variable in Render.
2. Trigger **Clear build cache and deploy** or redeploy the latest commit.
3. Watch for startup logs that pass database initialization.

## Quick Diagnosis Checklist

- `DATABASE_URL` starts with `postgresql+asyncpg://`
- The hostname is valid for the provider you are using
- For Supabase on Render, the hostname is `*.pooler.supabase.com`
- The password is URL-encoded if needed
- The database name and username are correct

## Expected Healthy Startup

Once fixed, the service should:

1. Initialize the database successfully
2. Finish FastAPI startup
3. Bind to Render's `$PORT`
4. Stay online instead of exiting with status `3`
