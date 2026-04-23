# Render Deployment Guide for Simba Backend

## Problem
The backend deployment was failing with:
```
sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL from given URL string
```

This occurs because **DATABASE_URL environment variable is not set** in Render deployment.

## Solution: Configure Environment Variables in Render

### Step 1: Go to Render Dashboard
1. Open https://dashboard.render.com
2. Select your service (the backend/API service)

### Step 2: Add DATABASE_URL Environment Variable
1. Go to **Settings** → **Environment**
2. Click **"+ Add Environment Variable"**
3. Set the following:
   - **Key**: `DATABASE_URL`
   - **Value**: Your PostgreSQL connection string

### Step 3: PostgreSQL Connection String Format

#### Option A: Using Render PostgreSQL (Recommended)
If you created a PostgreSQL database in Render:
```
postgresql+asyncpg://username:password@hostname:port/database_name
```

Example:
```
postgresql+asyncpg://myuser:mypassword@dpg-abc123.oregon-postgres.render.com:5432/simba_db
```

#### Option B: External PostgreSQL Database
```
postgresql+asyncpg://username:password@hostname:port/dbname
```

#### Option C: Neon PostgreSQL
```
postgresql+asyncpg://username:password@hostname/dbname?sslmode=require
```

### Step 4: Other Required Environment Variables

Make sure these are also set in Render:

```
DEBUG=false
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_JSON={...full JSON...}
JWT_SECRET_KEY=your-secret-key
STRIPE_SECRET_KEY=your-stripe-key
GROQ_API_KEY=your-groq-key (optional)
```

### Step 5: Redeploy
1. Go back to **Deploys** tab
2. Click **"Clear build cache and deploy"** (or create a new commit)
3. Monitor the deployment logs

## Database Setup for First Deployment

When the backend starts for the first time:
1. It will create the database schema automatically via Alembic
2. Mock data will be initialized (if enabled)
3. Admin user will be created

## Debugging

If deployment still fails:
1. Check **Render Logs** for the error message
2. Look for lines like:
   - `Starting database initialization...`
   - `DATABASE_URL (first 50 chars): postgresql+asyncpg://...`
3. Verify the connection string format is correct
4. Test the database connection locally first if possible

## Local Testing

To test locally with the same URL format:
```bash
export DATABASE_URL="postgresql+asyncpg://user:password@localhost:5432/simba"
python -m uvicorn main:app --reload
```

## Common Issues

### Issue: "Could not parse SQLAlchemy URL"
- **Cause**: DATABASE_URL is empty or malformed
- **Solution**: Check the URL format and ensure it uses `postgresql+asyncpg://`

### Issue: "Connection refused" or "could not translate host name"
- **Cause**: Database hostname is incorrect
- **Solution**: Verify the hostname in the connection string

### Issue: "FATAL: role 'username' does not exist"
- **Cause**: Wrong username in connection string
- **Solution**: Use the correct database username

### Issue: "FATAL: database 'name' does not exist"
- **Cause**: Wrong database name in connection string
- **Solution**: Use the correct database name

## References
- [Render Environment Variables](https://render.com/docs/environment-variables)
- [Render PostgreSQL Databases](https://render.com/docs/databases)
- [SQLAlchemy AsyncIO Documentation](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
