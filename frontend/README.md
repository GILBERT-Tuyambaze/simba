# Simba Frontend

Simba now runs as a Next.js App Router application deployed on Vercel.

## Stack

- Next.js App Router
- React
- Tailwind CSS and shadcn/ui
- Supabase Auth
- Supabase Postgres with RLS
- Supabase Storage
- Vercel Route Handlers for Stripe, AI catalog search, invitations, and analytics

## Required Environment

Create `frontend/.env.local` locally and configure the same values in Vercel:

```shell
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_TITLE=Simba Supermarket
NEXT_PUBLIC_APP_DESCRIPTION=Simba Supermarket - groceries, drinks, home essentials, and delivery in Kigali.
NEXT_PUBLIC_APP_LOGO_URL=/android-chrome-192x192.png

SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
```

`NEXT_PUBLIC_SUPABASE_URL` must be the Supabase project API URL, for example:

```text
https://<project-ref>.supabase.co
```

## Commands

```shell
npm install
npm run dev
npm run build
npm run preview
```

## Supabase

Apply migrations from the repository root:

```shell
supabase db push
```

Seed products from the existing catalog JSON:

```shell
npm run supabase:seed:products
```

Validate the live Supabase schema after migration:

```shell
npm run supabase:validate
```

The app no longer requires a dedicated backend server.

## Google OAuth

Google sign-in is handled only by Supabase Auth. Do not add Google client IDs
or client secrets to the Next.js environment.

Configure Google in Supabase:

1. Open Supabase Dashboard -> Authentication -> Providers -> Google.
2. Enable Google and paste the Google OAuth client ID and client secret there.
3. Add these redirect URLs in Supabase Authentication URL settings:

```text
http://localhost:3000/login
https://<your-vercel-domain>/login
```

New Google users are inserted into `public.profiles` by the
`on_auth_user_created` trigger with `role = customer`.
