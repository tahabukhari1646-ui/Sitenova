# Architecture decisions

This file records *why* we made structural choices, not just what they are —
so future changes are made with the original reasoning in mind, not against it.

## 1. Separate `client/` and `server/` apps (no monorepo tooling yet)

**Decision:** Two independent Node projects in one Git repo, each with its own
`package.json`. No Turborepo/Nx/workspaces.

**Why:** Sentinel AI needs a persistent backend process for scheduled
monitoring jobs (checking websites every N minutes), which doesn't fit
cleanly into Next.js API routes. Keeping frontend and backend fully separate
from day one means the monitoring engine can scale or deploy independently
of the dashboard later. Monorepo tooling is deliberately deferred until
there's real shared code worth deduplicating — introducing it earlier would
be complexity with no current payoff.

## 2. Feature-based modules on the backend, not layer-based

**Decision (planned for Step 2):** `server/src/modules/<feature>/` (e.g.
`websites/`, `monitors/`, `alerts/`) each containing their own controller,
service, repository, and routes — rather than top-level `controllers/`,
`services/`, `repositories/` folders shared across all features.

**Why:** As the number of features grows (website management, monitoring
checks, alerting, billing, auth), grouping by feature keeps related code
together and makes it obvious where to add or find something. Grouping by
technical layer instead tends to force you to jump between distant folders
to understand a single feature.

## 3. Isolated `integrations/` folder for third-party services

**Decision (planned for Step 2):** OpenAI, email providers, and future
external APIs (PageSpeed, WHOIS, SSL checks) each get a thin wrapper module
in `server/src/integrations/`.

**Why:** Business logic should depend on an interface we control, not
directly on a vendor SDK. This makes providers swappable and testable
without rewriting the modules that use them.
