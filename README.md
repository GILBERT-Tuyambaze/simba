# Simba

Simba runs on a backend-free architecture:

```text
User -> Next.js on Vercel -> Supabase
```

Runtime data and auth are handled by Supabase Auth, Postgres, Storage, and RLS. Secret-only operations run in Next.js route handlers.

## Main Commands

```shell
cd frontend
npm install
npm run dev
npm run build
```

Local app URL:

```text
http://localhost:3000
```

## Supabase

Schema and RLS live in `supabase/migrations`.

```shell
npm run supabase:db:push
npm run supabase:seed:products
npm run supabase:validate
```

> If checkout fails because `place_order_with_inventory` is missing, make sure the live Supabase schema is pushed to the project referenced by `DATABASE_URL`.

Set `NEXT_PUBLIC_SUPABASE_URL` to the project API URL format:

```text
https://<project-ref>.supabase.co
```

For CLI database pushes, use the Supabase session pooler connection string as
`DATABASE_URL` locally. Do not expose that value in client code.
