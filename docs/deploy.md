# Deploying (Docker Compose)

One container runs the API, serves the built web app, and runs the in-process scheduler (allowance,
interest, notifications). A second container runs Postgres. Everything is designed to sit behind a
reverse proxy that terminates TLS on your home server or VPS.

## 1. Prerequisites

- Docker + Docker Compose v2 (`docker compose version`).
- A domain (or subdomain) pointed at your server, e.g. `bank.example.com` — the app needs to be
  served over **https** (secure cookies, Web Push, and the Android app all require it).
- A reverse proxy in front of it that terminates TLS — see [§4](#4-reverse-proxy). Traefik, Nginx and
  Caddy examples are below; use whatever you already run in front of Authentik.
- An Authentik instance for parent sign-in — see [`docs/authentik-setup.md`](./authentik-setup.md).
  (You can develop/preview without it: `DEV_LOGIN_ENABLED=true` gives a fake-parent dev login, but
  never set that in production.)

## 2. Configure

```sh
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env`:

| Variable                                                                                          | Notes                                                                                     |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `APP_PORT`                                                                                        | Host port to publish (`3000` default). Irrelevant if you remove `ports:` for Traefik.     |
| `POSTGRES_PASSWORD`                                                                               | Pick a real password; it's used for both the `db` container and the app's `DATABASE_URL`. |
| `APP_URL`                                                                                         | Public origin, e.g. `https://bank.example.com` — **must** be the https URL users hit.     |
| `SESSION_SECRET`                                                                                  | See below.                                                                                |
| `AUTHENTIK_ISSUER` / `AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET` / `AUTHENTIK_PARENT_GROUP` | From [`docs/authentik-setup.md`](./authentik-setup.md) §2.                                |
| `AUTHENTIK_API_URL` / `AUTHENTIK_API_TOKEN`                                                       | Optional — enables invite links creating Authentik users. See setup doc §3.               |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`                                        | See below. Leave blank to disable Web Push (in-app notifications still work).             |
| `APP_ASSETLINKS_FINGERPRINTS` / `ANDROID_PACKAGE_NAME`                                            | Only needed for the Android app — see [`docs/android-build.md`](./android-build.md).      |

Generate a session secret (32+ random bytes, base64):

```sh
openssl rand -base64 48
```

Generate a VAPID key pair for Web Push:

```sh
npx web-push generate-vapid-keys
```

Paste the two keys into `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, and set `VAPID_SUBJECT` to
`mailto:you@example.com` (any contact address push services may use to reach you about your server).

## 3. Start it

```sh
docker compose -f deploy/docker-compose.yml up -d --build
```

This builds the image from `deploy/Dockerfile` (multi-stage: installs deps, builds `apps/web` and
`apps/api`, then a slim `node:22-alpine` runtime), starts Postgres, waits for its healthcheck, then
starts the app. Migrations run automatically on container start (`MIGRATIONS_DIR=/app/drizzle`, baked
in by the Dockerfile). First boot: watch it come up with

```sh
docker compose -f deploy/docker-compose.yml logs -f app
```

Once healthy, create your first family from `https://bank.example.com` and sign in as a parent
through Authentik.

## 4. Reverse proxy

The app trusts `X-Forwarded-Proto` (and `X-Forwarded-For`) from its proxy to know the original
request was https, so it can set the `Secure` cookie flag correctly and build correct absolute URLs
for OIDC redirects/invite links. **Every example below sets that header** — if you write your own
proxy config and cookies/login loop mysteriously fail, this is the first thing to check. No
WebSocket upgrade is needed (the app doesn't use one).

### Traefik

`deploy/docker-compose.yml` has a commented `labels:`/`networks:` block on the `app` service ready to
uncomment — it assumes your Traefik already has a `websecure` entrypoint with TLS and joins an
external `traefik` network (`docker network create traefik` once, if it doesn't exist yet). Traefik
sets `X-Forwarded-Proto`/`-For` itself, so nothing else to configure. Once enabled you can delete the
`ports:` mapping on `app` — Traefik reaches it over the compose network.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name bank.example.com;

    ssl_certificate     /etc/letsencrypt/live/bank.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bank.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name bank.example.com;
    return 301 https://$host$request_uri;
}
```

### Caddy

Caddy sets `X-Forwarded-For`/`-Proto` and handles TLS (via ACME) automatically — this is the whole
config:

```caddyfile
bank.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## 5. Backups

Postgres is the only state (accounts, ledger, sessions, push subscriptions). Dump it from the running
`db` container:

```sh
docker compose -f deploy/docker-compose.yml exec -T db pg_dump -U botf botf | gzip > botf-$(date +%F).sql.gz
```

Automate with cron, e.g. nightly at 2am, keeping 14 days:

```cron
0 2 * * * cd /path/to/Bank-of-the-Family && docker compose -f deploy/docker-compose.yml exec -T db pg_dump -U botf botf | gzip > /path/to/backups/botf-$(date +\%F).sql.gz
```

**Restore** (into a fresh or matching database — this does not merge, it loads into an empty schema):

```sh
gunzip -c botf-2026-01-01.sql.gz | docker compose -f deploy/docker-compose.yml exec -T db psql -U botf botf
```

## 6. Updating

```sh
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

Migrations run automatically on the new container's startup. To roll back, check out the previous
commit/tag and rebuild the same way — there's no separate migration-down step, so keep a recent
backup (§5) before updating across a release that changes the schema in a way you're unsure about.

## 7. Logs, health, and API docs

```sh
docker compose -f deploy/docker-compose.yml logs -f app     # app logs (pino, JSON lines)
docker compose -f deploy/docker-compose.yml logs -f db      # Postgres logs
```

- Health check: `GET /api/health` (also what the container's own Docker healthcheck polls).
- Interactive API reference: `GET /api/docs` (generated from the Zod schemas via
  `fastify-type-provider-zod` — see `CLAUDE.md`).

## See also

- [`docs/authentik-setup.md`](./authentik-setup.md) — OIDC provider + optional invite API token.
- [`docs/android-build.md`](./android-build.md) — package this deployment as an installable Android
  app once it's live.
- [`docs/architecture.md`](./architecture.md) — how the pieces fit together.
