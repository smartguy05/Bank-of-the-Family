# Bank of the Family

Self-hosted "online banking" for kids' allowances. Parents (Authentik OIDC) manage virtual accounts for
children (username + PIN). Web app (React PWA) + Android TWA. See `docs/architecture.md`.

## Layout

- `packages/shared` — **the API contract**: Zod schemas, enums, money utils. Both API and web import it.
  Change schemas here first; API validates/serializes with them, web derives types from them.
- `apps/api` — Fastify 5 + Drizzle (Postgres). Routes in `src/routes`, business logic in `src/services`,
  scheduled jobs in `src/jobs`. `src/services/ledger.ts` is the **only** place that inserts transactions.
- `apps/web` — React 19 + Vite + Tailwind v4 + TanStack Router/Query. PWA via vite-plugin-pwa (`src/sw.ts`).
- `apps/android` — Bubblewrap Trusted Web Activity project.
- `deploy` — Dockerfile + docker-compose. `docs` — setup guides.

## Commands

```sh
pnpm install
pnpm dev                      # api on :3000, web on :5173 (proxies /api)
pnpm lint && pnpm typecheck && pnpm test
pnpm db:generate              # after editing apps/api/src/db/schema.ts → new migration in apps/api/drizzle
pnpm db:migrate               # apply migrations to DATABASE_URL
pnpm --filter @botf/api test  # needs Postgres: DATABASE_URL_TEST (default postgres://botf:botf@127.0.0.1:5432/botf_test)
```

Local Postgres: user `botf` / password `botf`, databases `botf` (dev) and `botf_test` (tests).

## Conventions

- Money is always an **integer in minor units** (`amountMinor`). Never floats. Format with `formatMoney`.
- Ledger entries are signed: credits positive, debits negative. `runningBalanceMinor` is stored per entry.
  Accounts cache `balanceMinor`; the transactions table is the source of truth.
- Every family-scoped query filters by the **session user's** `familyId`, never a client-supplied one.
- Parents: full access in their family. Children: read own accounts/transactions/goals/notifications;
  write own goals, money requests, PIN change, push subscriptions, transfers between own accounts.
- Errors: throw `AppError` from `apps/api/src/lib/errors.ts` (`badRequest`, `forbidden`, `notFound`, …).
  Error body shape: `{ statusCode, error, code, message }`.
- Routes use `fastify-type-provider-zod`: declare `schema.body/querystring/params/response` with the shared
  Zod schemas so OpenAPI (`/api/docs`) stays accurate. Register new route plugins in `src/routes/index.ts`.
- Dates go over the wire as ISO strings with offset. DB timestamps are `timestamptz`.
- Do not add dependencies unless truly needed; all expected deps are already declared.
- Tests: Vitest. API integration tests use `test/helpers.ts` (`createTestContext`, `resetDb`, `cookieFrom`)
  against the real test database. Keep `fileParallelism: false` (shared DB).
- Web: use the design tokens in `src/styles.css` (`bg-brand-900`, `text-muted`, `rounded-card` …).
  Bank-like feel: account tiles, masked account numbers, "Available" vs "Current" balance, running balances,
  receipts, statement periods. Mobile-first (bottom tab bar), sidebar on desktop.
- Lint/format before finishing: `pnpm lint && pnpm format`.
