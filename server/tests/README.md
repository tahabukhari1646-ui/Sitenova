# Backend tests

Run from the project root:

```bash
npm --prefix server test        # full suite (rebuilds the test database first)
npm --prefix server run test:unit   # fast checks only, no database
npm --prefix server run typecheck   # TypeScript check of app + tests
```

## Safety

- **Separate database.** Tests use `sitenova_test` on the same Postgres server as
  `server/.env`. It is dropped and rebuilt from `prisma/migrations` at the start of
  every `npm test`. Real data is never read or written.
- **Safety lock.** The run stops unless the database name ends in `_test` and differs
  from the development database (`tests/setup/test-database.ts`).
- **No cost, no email.** AI and email are forced to `mock`; OpenAI, Resend and
  PageSpeed keys are removed for the run (`tests/setup/preload.ts`).
- **No internet.** Any request to a non-local host fails and is counted; every test
  file asserts the count is 0.
- **No schedulers.** Tests import `src/app.ts`, never `src/server.ts`.
- **No real DNS.** `dns.lookup` is replaced: names registered with `setTestDnsRecord()`
  resolve to the given addresses, `localhost`/literal IPs work, everything else is
  "not found".
- **Loopback exception (tests only).** `safeFetch` normally refuses every internal
  address (SSRF protection). The preload sets `SAFE_FETCH_ALLOW_LOOPBACK_FOR_TESTS=true`
  so the local fake website on `127.0.0.1` can be checked. It only works together
  with `NODE_ENV=test` and never opens private networks or `169.254.169.254`.
  `ssrf-protection.test.ts` turns it off to prove the real rules.

`TEST_DATABASE_NAME` can override the name (it must still end in `_test`).
The test database can be deleted at any time; the next run recreates it.

## Layout

| Folder | What it covers |
|---|---|
| `unit/` | AI output validators, SEO AI input (no scraped text), fingerprints, mock provider, OpenAI schemas, cost-control settings, uptime status/incident/alert rules, email content and provider selection, request validation |
| `api/` | Real HTTP requests: auth, Performance / SEO / Uptime AI routes, cost controls, automatic AI, ownership matrix, uptime monitoring cycle, email delivery, notifications, settings, websites |
| `helpers/` | Fake-data factories, test server, local fake website (`fake-website.ts`), mock-call counter, `withEnv` |

Uptime tests check a fake website on `127.0.0.1` instead of a real one. One test is
labelled **CURRENT BEHAVIOUR**: a 500 response currently counts as UP. If that rule is
changed on purpose, update that test as part of the same change.
| `setup/` | Safety lock, environment preload, test database rebuild |
