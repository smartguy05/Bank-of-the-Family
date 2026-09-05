# Authentik setup

Two integrations are needed: an OIDC provider for parent sign-in, and an API token so the app can
create Authentik users for co-parents who accept an invite without having an account yet.

## 1. Parent group

Directory → Groups → **Create**: name `bank-parents`. Add every parent to it. The name must match
`AUTHENTIK_PARENT_GROUP`. Users not in this group are refused at sign-in ("not a parent").

## 2. OIDC provider and application

Applications → Providers → **Create** → OAuth2/OpenID Provider:

| Setting                    | Value                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                       | Bank of the Family                                                                                                                                                                                                                                            |
| Authorization flow         | your default implicit-consent flow (e.g. `default-provider-authorization-implicit-consent`)                                                                                                                                                                   |
| Client type                | Confidential                                                                                                                                                                                                                                                  |
| Redirect URIs              | `https://bank.example.com/api/auth/oidc/callback` (strict)                                                                                                                                                                                                    |
| Signing key                | any RS256 key                                                                                                                                                                                                                                                 |
| Scopes                     | `openid`, `email`, `profile`, and the **groups** scope mapping (`authentik default OAuth Mapping: OpenID 'profile'` already includes `groups`; if not, add the `goauthentik.io/providers/oauth2/scope-profile` mapping or a custom one that returns `groups`) |
| Subject mode               | Based on the User's hashed ID (default)                                                                                                                                                                                                                       |
| Include claims in id_token | on                                                                                                                                                                                                                                                            |

Then Applications → **Create**: name `Bank of the Family`, slug `bank-of-the-family`, provider = the one
above, launch URL `https://bank.example.com`.

Environment:

```
AUTHENTIK_ISSUER=https://auth.example.com/application/o/bank-of-the-family/
AUTHENTIK_CLIENT_ID=<client id from the provider>
AUTHENTIK_CLIENT_SECRET=<client secret>
AUTHENTIK_PARENT_GROUP=bank-parents
APP_URL=https://bank.example.com
```

The issuer must end with a slash and match the provider's slug. The app discovers endpoints from
`<issuer>.well-known/openid-configuration`.

## 3. Service account for invites (optional but recommended)

This lets a parent invite someone who does not have an Authentik account yet. When they open the invite
link they choose a username and password; the app creates the Authentik user, adds it to
`bank-parents`, sets the password, and sends them to sign in.

1. Directory → Users → **Create Service account**: username `bank-of-the-family`, no expiry.
2. Directory → Tokens & App passwords → **Create**: identifier `bank-of-the-family-api`, user = the
   service account, intent **API**, no expiry. Copy the key.
3. Give the service account permission to manage users. Simplest: add it to a group that has the
   **Can add User**, **Can change User**, **Can view Group**, **Can add user to group** permissions
   (Directory → Roles → create role `bank-of-the-family` with those global permissions, then assign the
   role to a group containing the service account). Alternatively make the service account a superuser
   if you accept the broader scope.

```
AUTHENTIK_API_URL=https://auth.example.com/api/v3
AUTHENTIK_API_TOKEN=<the token key>
```

If these are unset, invite links still work for people who already have an Authentik account; the
"Create my account" option on the invite page is disabled.

## 4. Logout

The app calls Authentik's `end_session_endpoint` with the ID token so signing out of the bank also
ends the Authentik session. Add `https://bank.example.com/` to the provider's allowed redirect URIs if
Authentik complains about `post_logout_redirect_uri`.

## 5. Local development without Authentik

Set `DEV_LOGIN_ENABLED=true` in `apps/api/.env`; the web login page then offers a developer sign-in
that creates a fake parent. Never enable this in production.
