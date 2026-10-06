# Sentinel AI

Sentinel AI is a website uptime and health monitoring platform. It
periodically checks websites for availability, tracks failures, and detects
confirmed incidents so you always know when — and for how long — a site was
down.

**Planned, not yet implemented:** performance, SEO, and security checks, plus
AI-generated analysis and recommendations.

## Current implemented scope

- User authentication (register/login, JWT-based)
- Website management (add, update, delete, list), scoped to the owning user
- Automated uptime monitoring on a scheduled cycle, plus on-demand manual checks
- Derived monitoring status (up / degraded / down / unknown)
- Consecutive-failure tracking and failure confirmation
- Incident detection and lifecycle (open → resolved)
- Incident read API
- Incident history UI on the website detail page

## Roadmap

- Alerts and notifications (email/Slack)
- Performance, SEO, and security checks
- AI-powered analysis and recommendations

## Project structure

- `client/` — Next.js frontend (dashboard, auth)
- `server/` — Express API and background monitoring engine, backed by PostgreSQL via Prisma
- `docs/` — architecture decisions and planning notes

See `docs/architecture.md` for the reasoning behind key structural decisions.

## Getting started

`client/` and `server/` are independent projects, each with its own
`package.json` — install and run them separately.

### Prerequisites

- Node.js and npm (no specific version is pinned in this repo; verified working with Node 24 / npm 11)
- A running PostgreSQL database

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment variables

Copy `server/.env.example` to `server/.env` and fill in real values:

- `DATABASE_URL` — PostgreSQL connection string (required, read by Prisma)
- `JWT_SECRET` — secret used to sign authentication tokens (required)
- `PORT` — port the API server listens on (optional, defaults to `3001`)

The client optionally reads `BACKEND_URL` from `client/.env.local` to point
at the API server; if unset it defaults to `http://localhost:3001`.

### 3. Set up the database

From `server/`:

```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Run the app

Both the backend and frontend must be running at the same time — the
frontend proxies `/api/*` requests to the backend (see `client/next.config.ts`).

```bash
# terminal 1
cd server && npm run dev   # http://localhost:3001

# terminal 2
cd client && npm run dev   # http://localhost:3000
```

## Status

Early development. Follow-along build log — one step at a time.
