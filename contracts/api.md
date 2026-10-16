# Redline API - Endpoint Reference (v2)

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
  `UPDATE` (status/move/media/priority/due) = developer+ (admin counts as developer) or
  owner. Pending users and guests are blocked except guests may `CREATE` a
  report in guest mode. See `auth.md`.
- `checkFeature()`: `screenshots`, `videos`, `comments` endpoints abort 403
  `"Feature disabled."` when the feature is **not** listed in `REDLINE_FEATURES`
  (opt-in - see `bootstrap.md`).
- Rich text (`body`) is sanitized server-side with an HTML allowlist
  (`p,br,strong,em,s,a[href|title],ul,ol,li`, plus a `span` carrying only the
  TipTap mention attributes
  `data-type|data-id|data-label|data-mention-suggestion-char|class`; links forced
  `target=_blank rel=noopener noreferrer`).

---

## 1. Bootstrap

### GET /bootstrap - public
Rate-limited (`throttle:redline-bootstrap`, 120/min/IP). Capability manifest
fetched by widget+dashboard at mount. No auth, no CSRF.

Response `200` - see `bootstrap.md` and `bootstrap.schema.json` for the full
shape. `"version": 2` (int), `features` (string[]), `capabilities.auth.*`,
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
Two modes, selected by the bootstrap `capabilities.auth.login_mode`
(`AuthProvider::loginMode()` - see `bootstrap.md`):

- **Credentials mode** (`login_mode: credentials`, the default). Body: `email`
  (required, email), `password` (required), `remember` or `remember_me`
  (optional boolean → 30-day token instead of 1h).
- **Session mode** (`login_mode: session`, e.g. `LaravelAuthProvider`). The host
  application session IS the credential - the request body is intentionally
  ignored, so an empty-body POST is valid (see `bootstrap.md` Host-session
  mode). Only the cookie transport can carry the host session (same-origin);
  `remember` is ignored and the exchange is locked to the short-lived 1h token.

Origin gate (session mode only): when `loginMode() === 'session'` and an
`Origin` header is present but `Origin::allows()` fails (neither same-origin
nor listed in `redline.auth.allowed_origins`), the response is `403` plain
`{ "message": "Forbidden origin." }` - NOT the `{errors, pending}` envelope.
An absent `Origin` (non-browser client) is allowed.

Responses (both modes go through `AuthController::error()` →
`{ "errors", "pending" }`; `errors` is a flat string list, except register
validation which may be a field-keyed map):
- `200` - `{ "user": {...} }` + auth cookies (as register).
- `202` - `{ "errors": ["Account not yet approved."], "pending": true }`
  (pending account; message per provider `pendingMessage()`).
- `403` - `{ "errors": ["Login not available via this provider."], "pending": false }`
  (`canLogin()` false, e.g. the cloud provider).
- `401` - `{ "errors": ["Invalid credentials."], "pending": false }`
  (credentials mode: uniform for unknown email / wrong password - no
  enumeration; session mode instead reports a missing/unjoinable host session,
  e.g. `Not authenticated with the host application.` /
  `Host user has no email address.`).
- `422` - `{ "errors": ["..."], "pending": false }` (provider credential
  validation, e.g. a malformed `email` - a flat single-string list in the auth
  envelope, NOT Laravel's default `{message, errors}` shape).

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
`/user/aggregate?aggregate[status:count]=approved,pending&filter[search:like]=...&filter[role]=...`
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

Response: pagination envelope; each row base = `id`, `status`, `priority`
(default `"normal"`), `due_at` (`null` when unset), `created_at`. `priority` and
`due_at` are base-row fields, never include-gated. `due_at` is always serialized as
the true UTC instant (RFC3339 with `Z`) regardless of the host application's
configured timezone. `body`, `title`, `pin`, `element`, `url`, `location`, `browser`, `author`,
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
  "browser": { "...": "..." },                // optional object (any keys)
  "priority": "normal",                       // optional, low|normal|high|critical
  "due_at": "2026-07-03T17:00:00Z"            // optional RFC3339; any offset, normalized to UTC server-side
}
```
- `201` - the created report row (`fresh()->toArray()`): `id`, `status: "new"`,
  `priority` (the submitted value, or `"normal"` when omitted),
  `due_at` (the submitted value, or `null` when omitted), `author_id`,
  `url`, `location`, `body`, `pin`, `element`, `browser`,
  `created_at`, `updated_at`. No includes are applied to this response.
- Guest mode: anonymous POST /report is attributed to the shared Guest user
  (`guest@redline.local`), gated by the guest-origin allowlist and the
  `redline-guest` rate limiter (see auth.md). Otherwise `401`.
- `422` - validation shape (omitted `priority` defaults to `"normal"`; an
  unknown enum value 422s).
- `429` - guest `{ "message": "Too many requests." }`.

### PATCH /report/{report} - cookie | bearer (author only)
Body: `body` (required, sanitized). `200` - updated row (fresh, no includes).
`403` if not the author.

### DELETE /report/{report} - cookie | bearer (owner or admin)
Also deletes the stored screenshot/video files. `204` no content.

### POST /report/{report}/member - cookie | bearer (developer+ or author)
Adds members to the report. Body: `{ "user_ids": ["<uuid>", ...] }` - required
array, 1..100 ids (each a string ≤ 255 chars). Gated by `UPDATE` (developer/admin
or the report's author). Additive + idempotent (`syncWithoutDetaching`): re-posting
an existing id is a no-op, not `409`. Each id must exist, be **approved**, and
**not a guest**, else `422` `"One or more user ids are unknown."`. The report's
author is never a member: posting the author's id is a no-op (same as an already-
existing pair), and the author is excluded from the returned list. `200` with
`{ "members": [ { "id", "name", "initials" }, ... ] }` - the report's full current
list, sorted by `name` then `id`.

### DELETE /report/{report}/member - cookie | bearer (developer+ or author; self-removal)
Removes members. Body: `{ "user_ids": ["<uuid>", ...] }` - required array, 1..100
ids (each a string ≤ 255 chars). Gated by `UPDATE` (developer/admin or author),
except an eligible (approved, non-guest) caller may pass exactly their own id to
remove themselves; any other id list gets `403`. Idempotent (`detach`): removing a
pair that does not exist is a no-op, and ids are **not** validated for existence
(an unknown id returns `200`). The report's author is never a member, so the
author is excluded from the returned list. `200` with
`{ "members": [ { "id", "name", "initials" }, ... ] }` - the full current list,
sorted by `name` then `id`.

### POST /report/{report}/move - cookie | bearer (developer+ or owner)
Body: `x` (required numeric), `y` (required numeric), `scroll_x`, `scroll_y`
(optional numeric), `prefer_selector` (optional bool). Replaces the whole
`pin` object. `200` - updated row.

### PATCH /report/{report}/status - cookie | bearer (developer+ or owner)
Body: `status` (required; `new|noticed|progress|resolved|done`). Transitions
are constrained by role **and** the lifecycle chain (see below).

- `200` - updated row; it always carries `members` - the report's current member
  list (author excluded, sorted by `name` then `id`).
- `403` - `{ "message": "Invalid status transition." }` (not a legal target
  for this user/current state).
- `422` - validation (unknown enum value).

Lifecycle (bidirectional, adjacent only; `progress` may be skipped):
`new ↔ noticed ↔ progress ↔ resolved ↔ done` (+ `noticed ↔ resolved`).
Role targets: developers/admins → `noticed|progress|resolved`; reporter/owner
→ `progress|done`.

On the `noticed → progress` transition the backend additionally records the
**acting user** as a member (`syncWithoutDetaching`, idempotent). It is silently
skipped when the actor is not approved, is a guest, or is the report's author,
and can never fail the request. Other transitions leave members unchanged.

### PATCH /report/{report}/priority - cookie | bearer (developer+ or owner)
Body: `priority` (required; `low|normal|high|critical`). Any value is settable
at any time - no transition graph or constraint (unlike `status`).

- `200` - updated report row (fresh, no includes).
- `403` - forbidden (caller is neither developer+ nor the report owner).
- `422` - validation (missing or unknown enum value).

### PATCH /report/{report}/due_at - cookie | bearer (developer+ or owner)
Body: `{ "due_at": <rfc3339> | null }`. A timestamp sets the triage deadline;
`null` clears it. Any RFC3339 offset is accepted and normalized to UTC
server-side (`Carbon::parse()->utc()`), so the stored value is always UTC.

- `200` - updated report row (fresh, no includes; always carries `due_at`).
- `403` - forbidden (caller is neither developer+ nor the report owner).
- `422` - date validation (unparseable value).

### Report query schema
- filters: `status` (eq/not/like/in/not_in/null/not_null; values accept the
  groups `unresolved` → `new,noticed,progress` and `resolved` →
  `resolved,done`, or a concrete status), `priority` (string ops over the
  concrete values `low,normal,high,critical`; no value groups), `body`
  (string ops), `created_at`
  (date ops incl. `from`/`to`), `location` (string ops), `url` (string ops - the
  report's page URL; `eq` is an exact whole-URL match and `like` a substring
  match, exactly as for `body`/`location`; added additively, for MCP
  `report_list` parity), `author`
  (eq/not/in/not_in/exists on id; relation attribute `author.name` only -
  `author.email:like` 422s), `search` (like, OR body/location), `mine` (eq,
  `author_id` = current user; truthy value), `due` (closed enum
  `overdue|due_soon|none`, computed against `now()` at request time; `overdue`
  / `due_soon` apply to OPEN statuses only - `new|noticed|progress` - while
  `none` = no `due_at` and is NOT status-scoped; unknown value 422s), `due_at`
  (raw date ops incl. `from`/`to`/`null`/`not_null`; values must be `Y-m-d` or
  `Y-m-d H:i:s`, NOT full ISO-8601 - pre-existing lexical-compare behavior;
  power-user surface the UI never sends), `member` (eq/not/in/not_in/exists
  resolving to `members.id`: `filter[member]=<uuid>` (bare relation ==
  `members.id`), `filter[member:in]=<uuid>,<uuid>` (comma-separated OR),
  `filter[member:exists]=1|0` (1/true or 0/false only, anything else 422s) -
  the eq and `:in` forms are the ones the frontend sends (assigned-to-me /
  member-ids); `:not`/`:not_in` negate the whole membership predicate, and
  `member.<attr>` (e.g. `member.name:like`) is unsupported and 422s - no
  `relatedSchema`/`relatedFilters`), `screenshot` (exists),
  `video` (exists), `comments` (exists). `has_media` was REMOVED (v2) - it was
  an OR across screenshot/video; use the separate `screenshot:exists` /
  `video:exists` existence filters instead (two `filter[]`s are AND-combined,
  so "has any media" is no longer expressible in one call).
- sortable: `created_at`, `status`, `priority` (enum-ordered, not lexical -
  `sort[priority]=desc` puts `critical` first), `due_at` (NULLs sort LAST in
  both directions), `location`
  (default `created_at desc, id desc`).
- includable: `title`, `body`, `pin`, `element`, `url`, `location`; `browser`
  (developer gate); `author` (attrs `id,name,email`, default `id,name`);
  `screenshot` (`:exists`, attrs `id,url`); `video` (`:exists`, attrs `id,url`);
  `comments` (`:count`, `:exists`, fixed nested shape with `author: {id,name}`);
  `members` (bare form via resolver to rows of `{id,name,initials}`, author
  excluded; `:count`/`:exists` projections land as `members_count`/`members_exists`).
- aggregates: `status` (`:count`), `priority` (`:count`, plain-column),
  `location` (`:count`, `:unique`),
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
