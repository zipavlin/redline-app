# Redline API - Endpoint Reference (v1)

Base URL: `{api}` = `/{redline.path}/api`, default `/redline/api`.

All responses are JSON (`Accept: application/json`), except the two binary
endpoints. Collection endpoints speak the generic query grammar - see
`query-grammar.md`. Auth levels:

- **public** - no token, no CSRF. Rate-limited (`throttle:redline-bootstrap` or `throttle:redline-auth`).
- **cookie** - JWT in the HttpOnly `redline_token` cookie. State-changing methods (POST/PATCH/DELETE/PUT) additionally require double-submit CSRF: echo the `redline_csrf` cookie in the `X-Redline-CSRF` header (see `auth.md`). Middleware: `RedlineApiAuth` + `RedlineCsrf`.
- **bearer** - `Authorization: Bearer <jwt>` accepted by the same middleware (cross-origin widget / future cloud). Bearer requests skip CSRF.

ID format: UUID strings for all resources.

## Conventions

- `checkUser()` gates: any authenticated user passes `LIST`/`VIEW`/`CREATE`
  unless a role rule applies; `EDIT` = author only; `DELETE` = owner or admin;
  `UPDATE` (status/move/media) = developer+ (admin counts as developer) or
  owner. Pending users and guests are blocked except guests may `CREATE` a
  report in guest mode. See `auth.md`.
- `checkFeature()`: `screenshots`, `videos`, `comments` endpoints abort 403
  `"Feature disabled."` when the feature is in `REDLINE_DISABLED`.
- Rich text (`body`) is sanitized server-side with an HTML allowlist
  (`p,br,strong,em,s,a[href|title],ul,ol,li`, links forced
  `target=_blank rel=noopener noreferrer`).

---

## 1. Bootstrap

### GET /bootstrap - public
Rate-limited (`throttle:redline-bootstrap`, 120/min/IP). Capability manifest
fetched by widget+dashboard at mount. No auth, no CSRF.

Response `200` - see `bootstrap.md` and `bootstrap.schema.json` for the full
shape. `"version": 1` (int), `features` (string[]), `capabilities.auth.*`,
`capabilities.mail.configured`, `csrf.{cookie,header}`.

---

## 2. Auth

All public endpoints in this group are rate-limited
(`throttle:redline-auth`, 10/min/IP; `REDLINE_AUTH_THROTTLE`).

### POST /auth/register - public
Body: `name` (string, required), `email` (required, email), `password`
(required, ≥8 chars), `role` (optional, `reporter|developer|admin`; admin
requested via public registration is demoted to reporter unless
`REDLINE_AUTH_ALLOW_SELF_ADMIN=true` and no admin exists), plus any
provider-specific fields described by `capabilities.auth.fields`.

Responses:
- `200` - `{ "user": {...} }` + `Set-Cookie: redline_token` (HttpOnly) and
  `Set-Cookie: redline_csrf` (non-HttpOnly). User shape below.
- `202` - `{ "errors": ["Account created - pending approval or email verification."], "pending": true }`
  when the provider requires admin approval or email verification.
- `403` - `{ "errors": ["Registration not allowed."], "pending": false }`
  (provider denies self-registration).
- `422` - `{ "errors": { "<field>": ["..."] }, "pending": false }` (provider
  validation; field-keyed map, unlike Laravel's default shape).

### POST /auth/login - public
Body: `email` (required, email), `password` (required), `remember` or
`remember_me` (optional boolean → 30-day token instead of 1h).

Responses:
- `200` - `{ "user": {...} }` + auth cookies (as register).
- `202` - `{ "errors": ["Account not yet approved."], "pending": true }`.
- `403` - `{ "errors": ["Login not available via this provider."], "pending": false }`.
- `401` - `{ "errors": ["Invalid credentials."], "pending": false }`
  (uniform for unknown email / wrong password - no enumeration).
- `422` - Laravel default: `{ "message": "...", "errors": { "email": [...] } }`.

### GET /auth/verify - public, **signed** URL
Only reachable via the emailed verification link (provider-generated
`temporarySignedRoute`). Query params: `email`, `expires`, `signature`.
Tampered/expired signatures are rejected by Laravel's `signed` middleware
(403). Not called by the frontend directly.

Responses:
- `200` - `{ "user": {...} }` + auth cookies (account activated).
- `404` - `{ "errors": ["Verification not supported by this provider."], "pending": false }`
  (base provider default; no email verification flow).
- `422` - `{ "errors": ["Invalid or expired verification link."], "pending": false }`.

### POST /auth/forgot-password - public
Body: `email` (required, email). Emails a signed reset link (1h expiry,
`redline.auth.reset-password` route) pointing at the dashboard
`/reset-password?<signed-query>`. **Always `200`** `{ "ok": true }` whether or
not the account exists (no enumeration). No-op without a configured mailer.

### POST /auth/reset-password - public, **signed** URL
The signed query (`email`, `expires`, `signature`) must be re-POSTed from the
email link: `POST /auth/reset-password?email=...&expires=...&signature=...`.
Body: `password` (required, min 8). (`email` is taken from the signed query
string - the frontend only sends `password`.)

Responses:
- `200` - `{ "ok": true }` (all outstanding JWTs for the user are revoked via
  `token_version` bump).
- `422` - `{ "errors": ["Invalid or expired reset link."], "pending": false }`
  (unknown email), or Laravel validation shape for a bad password.
- `403` - invalid/expired signature (Laravel `signed` middleware).

### GET /auth/me - cookie | bearer
Responses:
- `200` - `{ "user": {...} }`.
- `401` - `{ "message": "Unauthenticated." }` / `{ "message": "Invalid or expired token." }`.

### GET /auth/refresh - cookie | bearer
Re-issues the token using the `remember` flag from the **verified** JWT
payload (client-sent remember flags are ignored). Response: `200`
`{ "user": {...} }` + refreshed cookies. (Cloud mode may return a `token`
string in JSON - see auth.md; the current local backend never does.)

### DELETE /auth - cookie | bearer (CSRF required for cookie)
Logout: bumps `token_version` (invalidates all outstanding JWTs) and expires
both cookies with their exact issue attributes.

Responses:
- `200` - `{ "message": "Logged out." }` (+ cookie deletion).
- `401` if unauthenticated.

### User shape (`user`)
```json
{
  "id": "uuid",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "role": "reporter",
  "status": "approved",
  "isApproved": true,
  "isPending": false,
  "isDeveloper": false,
  "isAdmin": false,
  "isGuest": false,
  "created_at": "2026-07-01T10:00:00.000000Z",
  "updated_at": "2026-07-01T10:00:00.000000Z"
}
```
`role` ∈ `guest|reporter|developer|admin`. `password` and `token_version` are
never serialized.

---

## 3. Users - admin only, except `GET /user` LIST (`403 { "message": "Admin access required." }` otherwise)

### GET /user - cookie | bearer (any authenticated)
Open to any authenticated user for member picking (see `auth.md`). Grammar:
`filter[]` `include[]` `sort[]` `paginate[]` (schema below). Base row is `id`,
`status`, `created_at`; `name`, `email`, `role`, `reports_count`,
`comments_count`, `stats` are include-gated.

Schema:
- filters: `search` (like, OR name/email), `name` (string ops), `email`
  (string ops), `role` (eq, in), `status` (eq, in; `approved|pending`).
- sortable: `name`, `created_at`, `reports_count`, `comments_count`
  (default `name asc, id asc`).
- includable: `name`, `email`, `role`, `initials`, `reports` (`:count`),
  `comments` (`:count`), `stats` (→ `{ "reports": n, "open": n, "resolved": n }`).

Response: pagination envelope (see query-grammar.md).

### GET /user/aggregate - cookie | bearer (admin)
Grammar: `filter[]` + `aggregate[]` (and the user schema's `status:count`).
Dashboard tab counts are computed from
`/user/aggregate?aggregate[status:count]=approved,pending&filter[search]=...&filter[role]=...`
(status filter deliberately omitted so tabs don't jump).

Response: `{ "<target>": { "<operator>": <scalar|object|array> } }` -
e.g. `{ "status": { "count": { "approved": 5, "pending": 2 } } }`.

### GET /user/{user} - cookie | bearer (admin)
Grammar: `include[]` only. Response: `{ "id", "status", "created_at", ...includes }`
(include `stats` for `{ reports, open, resolved }`).

### POST /user - cookie | bearer (admin)
Body: `name` (required), `email` (required, unique), `role` (required,
`reporter|developer|admin`), `password` (**nullable** when a mailer is
configured - omitting it emails a signed set-password invitation; **required**
without a mailer, min 8).

Responses:
- `201` - canonical row + `invitation_sent`:
  ```json
  { "id": "...", "name": "...", "email": "...", "role": "developer",
    "status": "approved", "reports_count": 0, "comments_count": 0,
    "invitation_sent": true }
  ```
- `422` - validation (Laravel shape; email uniqueness, role enum, password).
- `403` - non-admin.

### PATCH /user/{user} - cookie | bearer (admin)
Body: any of `name`, `email` (unique, ignoring self), `role`
(`reporter|developer|admin`), `status` (`approved|pending`).

- `200` - canonical row (as above, without `invitation_sent`).
- `422` - `{ "message": "Cannot demote or deactivate the last remaining admin." }`
  or validation shape.

### DELETE /user/{user} - cookie | bearer (admin)
- `204` no content.
- `422` - `{ "message": "Cannot delete the last remaining admin." }`.

### POST /user/{user}/approve - cookie | bearer (admin)
Sets `status: "approved"`. `200` - canonical row.

### POST /user/{user}/reset-password - cookie | bearer (admin)
Body: `password` (required, min 8). Bumps `token_version` (revokes the user's
JWTs). `200` - `{ "ok": true }`.

---

## 4. Reports

### GET /report - cookie | bearer
Grammar: `filter[]` `include[]` `sort[]` `paginate[]`. All authenticated roles
see all reports (no ownership scoping) unless `filter[mine]=1`.

Response: pagination envelope; each row base = `id`, `status`, `created_at`.
`body`, `title`, `pin`, `element`, `url`, `location`, `browser`, `author`,
`screenshot`, `video`, `comments`, `*_count`/`*_exists` projections are
include-gated.

### GET /report/aggregate - cookie | bearer
Grammar: `filter[]` + `aggregate[]` + `group_by[]`. Used for dashboard/widget
tab counts - typically sent **without** `filter[status]` so counts stay stable.

### GET /report/{report} - cookie | bearer
Grammar: `include[]`. **Side effect:** viewing a `new` report as a developer/
admin sets it to `noticed` (auto-acknowledge). `browser` is developer-only
(`user_agent` is always stripped, even for developers).

### POST /report - cookie | bearer | **guest** (when `redline.auth.guest=true`)
Body:
```json
{
  "url": "https://example.com/checkout",      // required, string ≤ 2048
  "location": "/checkout",                    // required, string ≤ 255
  "body": "<p>Cart total is wrong</p>",       // required, sanitized
  "pin": {                                    // optional object
    "x": 42.5, "y": 33.1,                    // 0..100
    "prefer_selector": true,                 // optional bool
    "scroll_x": 0, "scroll_y": 0             // optional numbers
  },
  "element": "div.product-card",              // optional string
  "browser": { "...": "..." }                 // optional object (any keys)
}
```
- `201` - the created report row (`fresh()->toArray()`): `id`, `status: "new"`,
  `author_id`, `url`, `location`, `body`, `pin`, `element`, `browser`,
  `created_at`, `updated_at`. No includes are applied to this response.
- Guest mode: anonymous POST /report is attributed to the shared Guest user
  (`guest@redline.local`), gated by the guest-origin allowlist and the
  `redline-guest` rate limiter (see auth.md). Otherwise `401`.
- `422` - validation shape.
- `429` - guest `{ "message": "Too many requests." }`.

### PATCH /report/{report} - cookie | bearer (author only)
Body: `body` (required, sanitized). `200` - updated row (fresh, no includes).
`403` if not the author.

### DELETE /report/{report} - cookie | bearer (owner or admin)
Also deletes the stored screenshot/video files. `204` no content.

### POST /report/{report}/move - cookie | bearer (developer+ or owner)
Body: `x` (required numeric), `y` (required numeric), `scroll_x`, `scroll_y`
(optional numeric), `prefer_selector` (optional bool). Replaces the whole
`pin` object. `200` - updated row.

### PATCH /report/{report}/status - cookie | bearer (developer+ or owner)
Body: `status` (required; `new|noticed|progress|resolved|done`). Transitions
are constrained by role **and** the lifecycle chain (see below).

- `200` - updated row.
- `403` - `{ "message": "Invalid status transition." }` (not a legal target
  for this user/current state).
- `422` - validation (unknown enum value).

Lifecycle (bidirectional, adjacent only; `progress` may be skipped):
`new ↔ noticed ↔ progress ↔ resolved ↔ done` (+ `noticed ↔ resolved`).
Role targets: developers/admins → `noticed|progress|resolved`; reporter/owner
→ `progress|done`.

### Report query schema
- filters: `status` (eq/not/like/in/not_in/null/not_null; values accept the
  groups `unresolved` → `new,noticed,progress` and `resolved` →
  `resolved,done`, or a concrete status), `body` (string ops), `created_at`
  (date ops incl. `from`/`to`), `location` (string ops), `author`
  (eq/not/in/not_in/exists on id; relation attribute `author.name` only -
  `author.email:like` 422s), `search` (like, OR body/location), `mine` (eq,
  `author_id` = current user; truthy value), `screenshot` (exists),
  `video` (exists), `comments` (exists).
- sortable: `created_at`, `status`, `location` (default `created_at desc, id desc`).
- includable: `title`, `body`, `pin`, `element`, `url`, `location`; `browser`
  (developer gate); `author` (attrs `id,name,email`, default `id,name`);
  `screenshot` (`:exists`, attrs `id,url`); `video` (`:exists`, attrs `id,url`);
  `comments` (`:count`, `:exists`, fixed nested shape with `author: {id,name}`).
- aggregates: `status` (`:count`), `location` (`:count`, `:unique`),
  `author` (`:count` grouped by `author_id`, `:unique` → `[{id,name},...]`).

---

## 5. Comments (nested under a report)

Comment row shape: `id`, `report_id`, `author_id`, `body`, `created_at`,
`updated_at`, `author` (`{ id, name }`).

### GET /report/{report}/comment - cookie | bearer
All comments for the report, `created_at` ascending, author `id,name`
preloaded. Response: `200` JSON array of comment rows (no envelope).

### POST /report/{report}/comment - cookie | bearer
Body: `body` (required, sanitized). `201` - created comment (with `author`).
`403` `"Feature disabled."` if comments are disabled.

### PATCH /report/{report}/comment/{comment} - cookie | bearer (author only)
Body: `body` (required). `200` - updated comment (with `author`).
`404` if the comment does not belong to `{report}`.

### DELETE /report/{report}/comment/{comment} - cookie | bearer (owner or admin)
`204` no content. `404` on parent mismatch.

---

## 6. Screenshot (one per report)

Screenshot row shape: `id`, `report_id`, `path`, `url` (appended accessor -
see note below).

### GET /report/{report}/screenshot - cookie | bearer
`200` - screenshot row, or `404` `{ "message": "Screenshot not found." }`.

### POST /report/{report}/screenshot - cookie | bearer (developer+ or owner)
Multipart form field `screenshot` (file, **PNG only**, ≤ 5 MB - `mimes:png`,
`max:5120` KB). Replacing an existing screenshot is **not** allowed.
- `201` - screenshot row. `409` - `{ "message": "Screenshot already exists for this report." }`
- `403` `"Feature disabled."` if screenshots disabled.

### GET /report/{report}/screenshot/{screenshot}/binary - cookie | bearer
Binary file stream (`response()->file(...)`), with `?token=` support in the
model's `url` accessor - **caveat**: `RedlineApiAuth` does *not* accept
query-string tokens, so the accessor's `?token=` form only works when the
request still carries the cookie or a Bearer header. `404` on parent mismatch.

---

## 7. Video (one per report)

Video row shape: `id`, `report_id`, `path`, `url`.

### GET /report/{report}/video - cookie | bearer
`200` - video row, or `404` `{ "message": "Video not found." }`.

### POST /report/{report}/video - cookie | bearer (developer+ or owner)
Multipart form field `video` (file, ≤ 50 MB - `max:51200` KB, **no MIME
restriction**; the widget sends WebM or MP4). One video per report.
- `201` - video row. `409` - `{ "message": "Video already exists for this report." }`
- `403` `"Feature disabled."` if videos disabled.

### GET /report/{report}/video/{video}/binary - cookie | bearer
Binary file stream. Same `?token=` caveat as screenshot binary. `404` on
parent mismatch.

---

## Where the grammar applies

| Endpoint                                  | filter[] | include[] | sort[] | paginate[] | aggregate[] | group_by[] |
|-------------------------------------------|:--------:|:---------:|:------:|:----------:|:-----------:|:----------:|
| GET /report                               | ✓        | ✓         | ✓      | ✓          | –           | –          |
| GET /report/aggregate                     | ✓        | –         | –      | –          | ✓           | ✓          |
| GET /report/{report}                      | –        | ✓         | –      | –          | –           | –          |
| GET /user                                 | ✓        | ✓         | ✓      | ✓          | –           | –          |
| GET /user/aggregate                       | ✓        | –         | –      | –          | ✓           | –          |
| GET /user/{user}                          | –        | ✓         | –      | –          | –           | –          |
| comment / screenshot / video endpoints    | –        | –         | –      | –          | –           | –          |

Unknown or non-whitelisted grammar params 422 (never silently ignored) - see
`query-grammar.md`.
