# Authentication Contract (v2)

## Overview

Two transport modes share one JWT (HS256, signed with `app.key` - `base64:`
prefix decoded):

- **Cookie (same-origin, default for the dashboard)** - the JWT is delivered
  exclusively as an HttpOnly `redline_token` cookie, never in JSON bodies.
  JS cannot read it. State changes additionally require **double-submit
  CSRF**.
- **Bearer (cross-origin widget / future cloud)** - `Authorization: Bearer
  <jwt>`; skips CSRF. The frontend's `BearerTransport` never sends cookies
  and injects the token from `sessionStorage` key `redline_cloud_token`
  (`identity.getToken()`).

The middleware reads the Bearer header **first**, then falls back to the
cookie; the query string is intentionally **not** accepted (leaks into
logs/Referer).

## JWT

Issued by `AuthController::issueToken()`:

| Claim | Meaning |
|---|---|
| `sub` | user UUID |
| `ver` | `token_version` - bumped on logout / password change; every older JWT is rejected |
| `role` | `guest\|reporter\|developer\|admin` |
| `name`, `email` | user snapshot |
| `remember` | bool - remembered login (30-day TTL) |
| `iat`, `exp` | issued/expiry (unix seconds) |

- TTL: 3600 s (`REDLINE_AUTH_TOKEN`) or 2592000 s / 30 days with
  remember (`REDLINE_AUTH_REMEMBER_TOKEN`).
- Verification: signature (HS256), expiry, `sub` → existing user, `ver` ===
  user's current `token_version`. Any failure → 401.
- The verified payload is attached to the request as
  `redline_token_payload` so `GET /auth/refresh` re-issues from the
  **verified** `remember` flag, never from client-controlled input.

## Cookies

Issued together by every token-bearing auth response (register, login, verify,
refresh), with identical `Path`, `Domain`, `Secure`, `SameSite`:

| Cookie | HttpOnly | Purpose |
|---|---|---|
| `redline_token` | yes | The JWT. Exempt from Laravel cookie encryption; never readable by JS |
| `redline_csrf` | no | 32-char random double-submit token; JS reads it to echo as the CSRF header |

Attributes: `Path=/`, `SameSite=lax`, `Secure=true` (defaults;
`REDLINE_COOKIE_SECURE=false` for plain-HTTP dev; `REDLINE_COOKIE_DOMAIN`
optional). The CSRF cookie TTL matches the JWT's remaining life.

Logout (`DELETE /auth`) bumps `token_version` (revokes all outstanding JWTs)
and expires **both** cookies with their exact issue attributes.

## Double-submit CSRF

Enforced by `RedlineCsrf` middleware **after** auth, only when:

1. the request was authenticated via the **cookie** (`redline_auth_source ===
   'cookie'`), AND
2. the method is `POST`, `PATCH`, `DELETE`, or `PUT`.

Then: the `redline_csrf` cookie value must equal the `X-Redline-CSRF` header
(constant-time `hash_equals`) - else **419**
`{ "message": "CSRF token mismatch." }`. Additionally, an `Origin` header, when
present, must match the request's scheme+host or `redline.auth.allowed_origins`
(`REDLINE_ALLOWED_ORIGINS`) - else **403** `{ "message": "Forbidden origin." }`.

Exempt: Bearer-authenticated requests, guest submissions, and safe methods
(GET/HEAD/OPTIONS). Both cookie names come from the bootstrap payload
(`csrf.cookie` / `csrf.header`, defaults `redline_csrf` / `X-Redline-CSRF`);
the frontend's `CookieTransport` applies the names from the bootstrap once
loaded and sends `credentials: 'same-origin'`.

## Flows

### Register → token (OpenAuthProvider, default)
`POST /auth/register` with `name`, `email`, `password`, optional `role`
(admin requested publicly is demoted to reporter unless
`REDLINE_AUTH_ALLOW_SELF_ADMIN=true` and no admin exists). Provider
validation failures → 422 field-keyed. Success → 200 `{ user }` + cookies.
Providers needing approval/verification instead return **202 pending** with no
cookies.

### Login
`POST /auth/login` with `email`, `password`, optional `remember`/
`remember_me`. Uniform 401 for unknown email / wrong password (no
enumeration; timing-equalized). Pending accounts → 202. Success → 200
`{ user }` + cookies (remember → 30-day token).

### Verify (email verification - DomainAuthProvider)
A signed `GET /auth/verify?email=…&expires=…&signature=…` link is emailed
(24h validity). Opening it activates the account and returns the user + token
cookies directly. Not called by the frontend; only reachable via the link.
Providers without verification return 404 (base provider default).

### Forgot / reset password
`POST /auth/forgot-password` (email) always returns 200 `{ ok: true }` -
no account enumeration; the signed reset link (1h) is emailed only when the
account exists. The dashboard's `/reset-password?<signed-query>` page re-POSTs
the query verbatim to `POST /auth/reset-password?<signed-query>` with the new
`password` - the `email` in the signature comes from the query string, not the
body. Success bumps `token_version`, revoking all outstanding JWTs (a real
sign-out-everywhere).

### Refresh
`GET /auth/refresh` re-issues the token from the verified payload's
`remember` flag - used by the session bootstrap when "remember me" was chosen.
Cloud mode may return a `token` in the JSON body (`{ token?, user }`), which
the frontend stores in `sessionStorage.redline_cloud_token`; **the current
local backend never returns a `token` in JSON** (cookie-only). The frontend
type models this as optional.

### Logout
`DELETE /auth` (CSRF required in cookie mode) → 200 `{ "message": "Logged out." }`,
token_version bumped, both cookies expired.

## Guest mode

Enabled by `redline.auth.guest` (`REDLINE_AUTH_GUEST`). When on, an
**anonymous** `POST /report` (no token at all) is allowed through
`RedlineApiAuth` and attributed to the shared Guest user
(`guest@redline.local`, `role: guest`, created on demand). Guest users may
only `CREATE` reports. Rules:

- **Origin check** (`redline.auth.guest_origins`, comma-separated): when
  configured, the `Origin` (or `Referer` fallback) must match the allowlist or
  the request's own scheme+host - else 403 `{ "message": "Forbidden origin." }`.
  Unset = no restriction (backward compatible).
- **Rate limit**: the `redline-guest` limiter (default 20/min/IP,
  `REDLINE_AUTH_GUEST_THROTTLE`) - over limit → 429
  `{ "message": "Too many requests." }`.

## Access rules (policy gates)

| Operation | Who |
|---|---|
| `LIST` / `VIEW` | any authenticated user |
| `CREATE` | any authenticated (guest allowed only in guest mode for reports) |
| `EDIT` (body updates) | **author only** - developers/admins cannot rewrite others' bodies |
| `DELETE` | owner **or** admin |
| `UPDATE` (status / pin move / media attach) | developer+ (admin counts) **or** owner |
| user management (`/user*`) | **admin only** (403 `"Admin access required."`) - **except `GET /user` (LIST)**, open to any authenticated user |

`GET /user` (LIST) is deliberately open to any authenticated user so the widget
member picker can assign reporters/developers; the base row is only
`id`/`status`/`created_at` and PII such as `email` is returned only when
explicitly requested via `include[]`, so relaxing LIST leaks nothing by default.
All other user endpoints (VIEW `/user/{user}`, `/user/aggregate`,
store/update/destroy/approve/reset-password) stay admin-only.

Pending users are blocked from everything; guests are blocked from everything
except creating reports in guest mode. Status transitions additionally follow
the lifecycle chain (see `api.md`).

## Not yet implemented

- **Query-string bearer tokens**: the screenshot/video `url` accessors may
  append `?token=<bearer>` to binary URLs, but `RedlineApiAuth` deliberately
  ignores query-string tokens - such URLs 401 unless the request carries the
  cookie or a Bearer header. Documented as a known ambiguity, not a feature.
