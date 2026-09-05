# Bank of the Family

Self-hosted "online banking" for kids' allowances. Parents sign in with your own [Authentik](https://goauthentik.io)
instance and run a virtual bank for their kids; kids sign in with just a username and PIN, watch
their balances grow, and manage their own money within limits their parents set. It's a Progressive
Web App with an installable Android wrapper, and it runs entirely on your own server — no cloud
service holds this data.

## Features

- **Parent and child accounts** — parents authenticate via Authentik OIDC; children get a
  username + 4–6 digit PIN with no email or third-party account needed.
- **Deposits, charges, and categories** — parents post money in and out with labels like Allowance,
  Chore, Reward, Gift, Purchase; every entry is an append-only, running-balance ledger.
- **Multiple accounts per child** — e.g. Spending and Savings, with transfers between them.
- **Recurring allowance** — scheduled, idempotent, posted automatically on the family's own cadence.
- **Interest** — a configurable annual rate, compounded and posted monthly.
- **Savings goals** — kids earmark money toward something they're saving for; earmarked funds are
  set aside from the "available" balance shown for spending.
- **Money requests** — kids can ask a parent for money; parents approve or decline.
- **Notifications** — an in-app inbox plus Web Push (VAPID), no Firebase required — works the same in
  the browser and in the installed Android app.
- **Statements & CSV export** — review and download transaction history by period.
- **Authentik SSO** — bring your own identity provider for parent login; see
  [`docs/authentik-setup.md`](docs/authentik-setup.md).
- **Android app** — an installable Trusted Web Activity wrapping the PWA; see
  [`docs/android-build.md`](docs/android-build.md).

## Screenshots

_Coming soon — add screenshots of the dashboard, an account's transaction list, and the savings goal
view here once the UI has settled._

## Quick start (development)

Requires Node 22 ([`.nvmrc`](.nvmrc)), [pnpm](https://pnpm.io) 10, and a local Postgres.

```sh
pnpm install

# Postgres: create the botf/botf user+databases described below, or run one via Docker:
docker run -d --name botf-pg -e POSTGRES_USER=botf -e POSTGRES_PASSWORD=botf \
  -e POSTGRES_DB=botf -p 5432:5432 postgres:16-alpine
# and a second database for tests:
docker exec botf-pg psql -U botf -c 'CREATE DATABASE botf_test;'

pnpm db:migrate                        # apply migrations to DATABASE_URL (postgres://botf:botf@127.0.0.1:5432/botf)
pnpm --filter @botf/api seed           # demo family + transaction history

pnpm dev                               # api on :3000, web on :5173 (proxies /api to :3000)
```

Open <http://localhost:5173>. The seed creates a demo family with:

- Kid logins **`alex` / `1234`** and **`sam` / `5678`**.
- A developer parent sign-in on the login page (only available because `DEV_LOGIN_ENABLED=true` in
  `apps/api/.env` for local dev — never enable this in production) that creates a fake parent without
  needing an Authentik instance running locally.

Copy `apps/api/.env.example` to `apps/api/.env` first if you want to change any of the above (DB
connection, ports, etc.) — see [`CLAUDE.md`](CLAUDE.md) for the full local dev command reference and
project conventions.

```sh
pnpm lint && pnpm typecheck && pnpm test    # before sending a PR
```

## Deploying it for your family

See [`docs/deploy.md`](docs/deploy.md) for a full walkthrough: Docker Compose, environment
configuration, reverse proxy examples (Traefik/Nginx/Caddy), backups, and updates. You'll also want
[`docs/authentik-setup.md`](docs/authentik-setup.md) for parent sign-in, and
[`docs/android-build.md`](docs/android-build.md) if you want an installable Android app pointed at
your deployment.

## Docs

| Doc                                                  | Covers                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)       | How the pieces fit together: identity, the money/ledger model, notifications. |
| [`docs/deploy.md`](docs/deploy.md)                   | Docker Compose deployment, reverse proxies, backups, updates.                 |
| [`docs/authentik-setup.md`](docs/authentik-setup.md) | Configuring Authentik for parent OIDC login + optional invite API.            |
| [`docs/android-build.md`](docs/android-build.md)     | Building, signing, and installing the Android Trusted Web Activity.           |
| [`CLAUDE.md`](CLAUDE.md)                             | Local dev commands and codebase conventions.                                  |

## Project layout

```
packages/shared   the API contract: Zod schemas, enums, money helpers — imported by both apps below
apps/api          Fastify 5 + Drizzle (Postgres); serves the built web app in production
apps/web          React 19 PWA (Vite, Tailwind v4, TanStack Router/Query)
apps/android      Trusted Web Activity wrapping the PWA (installable Android app)
deploy            Dockerfile + docker-compose for self-hosting
docs              Setup and deployment guides
```

## License

[MIT](LICENSE) © Bank of the Family contributors
