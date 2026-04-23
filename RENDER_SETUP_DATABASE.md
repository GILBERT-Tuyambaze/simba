# Fix Render Backend Deployment - `DATABASE_URL` Setup

## Problem

The backend build succeeds, but startup fails when the app tries to connect to PostgreSQL:

```text
socket.gaierror: [Errno -2] Name or service not known
```

In this project, that usually means `DATABASE_URL` points to a database hostname Render cannot resolve or reach.

## Most Likely Cause with Supabase

If you are using Supabase, do **not** use the direct database host on Render:

```text
postgresql://postgres:password@db.<project-ref>.supabase.co:5432/postgres
```

That direct host is intended for direct database connections and commonly causes deployment failures on Render.

For a Render web service, use the **Supabase pooler session mode** connection string instead.

## Correct Fix

### Option A: Render PostgreSQL

If your database is hosted on Render:

```text
postgresql+asyncpg://username:password@hostname:5432/database
```

Use the **Internal Database URL** from the Render database service, then replace:

```text
postgresql://
```

with:

```text
postgresql+asyncpg://
```

### Option B: Supabase PostgreSQL on Render

1. Open your Supabase project.
2. Click **Connect**.
3. Copy the **Session pooler** connection string, not the direct connection string.
4. Convert it to SQLAlchemy async format by changing:

```text
postgres://
```

to:

```text
postgresql+asyncpg://
```

Expected shape:

```text
postgresql+asyncpg://postgres.<project-ref>:password@aws-0-<region>.pooler.supabase.com:5432/postgres
```

## Important Detail: Encode Special Characters

If your database password contains characters like `@`, `:`, `/`, or `#`, URL-encode the password before saving it in `DATABASE_URL`.

Example:

```text
myP@ssword
```

becomes:

```text
myP%40ssword
```

## Set It in Render

1. Open your backend service in Render.
2. Go to **Settings** -> **Environment**.
3. Update `DATABASE_URL`.
4. Save the change.
5. Redeploy the service.

## Sanity Check

Before redeploying, verify all of the following:

- The URL starts with `postgresql+asyncpg://`
- If you use Supabase on Render, the host is `*.pooler.supabase.com`, not `db.<project-ref>.supabase.co`
- The password is URL-encoded if it contains reserved characters
- The database name is correct

## Expected Result

After fixing `DATABASE_URL`, Render should get past startup and the app should bind to `$PORT` normally.
