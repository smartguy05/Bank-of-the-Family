# Architecture

Bank of the Family is a self-hosted "online bank" for kids' allowances. Money is virtual: parents
deposit and charge, kids watch balances grow, earn interest, save toward goals, and request money.

```
┌────────────────────┐   HTTPS (your reverse proxy)   ┌──────────────────────────────┐
│  Browser / PWA     │ ─────────────────────────────▶ │  app container               │
│  Android TWA       │        cookie session          │  Fastify API  /api/*         │
└────────────────────┘                                │  static web   /*             │
          │  Web Push (VAPID)                         │  scheduler (croner, 5 min)   │
          ▼                                           └──────────────┬───────────────┘
   push service (browser vendor)                                     │ pg
                                                      ┌──────────────▼───────────────┐
┌────────────────────┐   OIDC (parents)               │  Postgres 16                 │
│  Authentik         │ ◀──────────────────────────────│  ledger, users, sessions …   │
│  + API (invites)   │                                └──────────────────────────────┘
└────────────────────┘
```

## Packages

| Path              | What                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `packages/shared` | The API contract: Zod schemas, enums, money helpers. Imported by API and web. |
| `apps/api`        | Fastify 5 + Drizzle ORM on Postgres. Serves the built web app in production.  |
| `apps/web`        | React 19 PWA (Vite, Tailwind v4, TanStack Router/Query).                      |
| `apps/android`    | Bubblewrap Trusted Web Activity wrapping the PWA.                             |
| `deploy`          | Dockerfile, docker-compose, env template.                                     |

## Identity

- **Parents** sign in through Authentik (OpenID Connect, authorization code + PKCE). A user is a parent
  when their `groups` claim contains `AUTHENTIK_PARENT_GROUP` (default `bank-parents`).
- **Kids** have no email and no Authentik account. A parent creates them with a username and a 4–6 digit
  PIN (argon2 hashed, lockout after 5 failures). Kid sessions last 30 days by default.
- Both kinds of login produce the same server-side session (Postgres `sessions` table, httpOnly cookie).
- **Families**: a parent with no family creates one. Co-parents join through invite links. An invitee with
  no Authentik account fills in a username/password and the API creates the Authentik user for them
  (service-account token), then sends them through the normal OIDC login.

## Money model

- All amounts are integers in the currency's minor unit (cents). Each family picks its currency, locale
  and timezone; formatting uses `Intl.NumberFormat`.
- `transactions` is an append-only ledger. Each entry is signed (credits positive, debits negative) and
  stores the running balance after it posted. `accounts.balance_minor` is a cache kept in the same DB
  transaction. The account row is locked (`SELECT … FOR UPDATE`) while posting.
- Kinds: `deposit`, `charge`, `withdrawal` (parent-initiated debit for cash handed to the child; not
  reversible — a parent corrects it with a deposit instead), `transfer_in`/`transfer_out` (two linked
  legs), `allowance`, `interest`, `request_payout`, `reversal`. Categories (Allowance, Chore, Reward,
  Gift, Purchase, …) label the entry.
- No overdraft unless the family enables `allowOverdraft`.
- Savings goals earmark money inside an account: available balance = balance − open goal earmarks.
- IOUs (`ious`) record that one child owes another. A kid who owes can record it directly; a kid who is
  owed records a claim the debtor must accept. Payments (whole or partial, by the debtor or a parent on
  their behalf) are ordinary two-leg transfers with category `iou`, each tracked in `iou_payments`; a
  parent can forgive what remains. Deleting an IOU is only possible before any money has moved, so the
  ledger is never contradicted.
- Scheduled allowance and monthly interest are posted by the in-process scheduler with idempotency keys,
  so retries never double-post. Interest = balance × annual rate / 12, posted on the 1st of each month
  in the family's timezone.

## Notifications

`notify()` writes an inbox row and fans out Web Push (VAPID) to the user's subscriptions. The PWA's
service worker (`apps/web/src/sw.ts`) shows the notification and opens the right page on click. The
Android TWA runs inside Chrome, so the same Web Push works there without Firebase.

## Authorization

Every family-scoped query is filtered by the **session user's** family id. Parents have full access
within their family. Children can read their own accounts, transactions, goals and notifications, and
can create goals and money requests, move money between their own accounts, change their PIN, and
manage push subscriptions. They can also send money to siblings, request it from them, and record and
pay IOUs with them; every family member can see the family's IOUs.

## Runtime

One container runs the API, serves the web build and runs the scheduler. Migrations run at start.
Postgres runs as a second container with a named volume. Put the app behind the same reverse proxy that
fronts Authentik and terminate TLS there (`APP_URL` must be the public https origin).
