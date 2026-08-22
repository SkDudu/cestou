# Cestou — App Cliente

App consumidor (Next.js) que consome o mesmo Convex do pipeline de encartes.

Spec: [`docs/cliente-mvp.md`](../docs/cliente-mvp.md)

Admin: `front-admin/` (porta 3000). Cliente: `front-client/` (porta **3001**).

## Setup

```bash
cd front-client
npm install
# NEXT_PUBLIC_CONVEX_URL no .env.local (mesmo do admin)
npm run dev
```

Convex: schema + funções `client*` vivem em `back/convex` (symlink `front-client/convex` → `../back/convex`).

```bash
cd back && npm run convex:dev
```

## Auth MVP

Sessão anônima via `localStorage` (`cestou_session_token`) → `clientAuth.ensureSession`. Email/senha depois.
