# Smart Grocery — Admin Dashboard

Internal scraper validation dashboard (SPEC 005).

## Setup

```bash
# terminal 1 — Convex (from back/)
cd ../back && npx convex dev

# terminal 2 — dashboard
cd front-admin
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000/admin

## Env

| Var | Default |
|-----|---------|
| `NEXT_PUBLIC_CONVEX_URL` | `http://127.0.0.1:3210` |

Convex functions live in `../back/convex/`.
