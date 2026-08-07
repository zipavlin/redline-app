# Error Envelope (v1)

All error responses are JSON with the `Accept: application/json` the client
sends. There are **three** envelope families — the auth controller's custom
`{errors, pending}`, Laravel's validation `{message, errors}`, and plain
`{message}` — plus binary/`204` exceptions. The frontend parses all shapes
defensively (`parseApiErrors`): an `errors` array (flat or deeply nested
strings) becomes a summary, an `errors` object becomes per-field messages, and
a top-level `message` is used as a summary fallback.

## Status code map

| Code | Meaning | Envelope |
|------|---------|----------|
| 200 | OK | resource / `{ "ok": true }` / `{ "user": ... }` |
| 201 | Created | created resource row (report, comment, screenshot, video, user) |
| 202 | Accepted — pending | `{ "errors": ["..."], "pending": true }` (register/login pending approval/verification) |
| 204 | No content | empty body (deletes) |
| 400 | — | not used by the API |
| 401 | Unauthenticated / bad token | `{ "message": "Unauthenticated." }` or `{ "message": "Invalid or expired token." }` |
| 403 | Forbidden / feature / origin / policy | `{ "message": "..." }` or `{ "errors": ["..."], "pending": false }` (auth controller gates) |
| 404 | Not found / parent mismatch | `{ "message": "..." }` or Laravel default (empty) for aborts |
| 409 | Conflict (media already attached) | `{ "message": "Screenshot already exists for this report." }` / `"Video already exists for this report."` |
| 419 | CSRF token mismatch | `{ "message": "CSRF token mismatch." }` |
| 422 | Validation / grammar / illegal transition | `{ "message": "...", "errors": { field: [string] } }` or auth-controller `{ "errors": ..., "pending": false }` |
| 429 | Rate limited | Laravel throttle: `{ "message": "Too Many Requests" }` + `Retry-After`; guest limiter: `{ "message": "Too many requests." }` (no header) |
| 500 | Server error | Laravel default |

## Envelope shapes

### 1. Auth controller custom envelope (register / login / verify / reset-password / user reset-password)
`errors` may be a **flat list of strings** or a **field-keyed map**
`{ field: [messages] }` (register's provider validation). `pending` is a
boolean flagging the account-pending state.

```json
{ "errors": ["Invalid credentials."], "pending": false }
{ "errors": { "email": ["The email field is required."] }, "pending": false }
{ "errors": ["Account not yet approved."], "pending": true }
```

Produced by: `AuthController::error()` — statuses 403 (`Registration not
allowed.`, `Login not available via this provider.`), 422 (provider
validation, `Invalid or expired reset link.`, `Invalid or expired
verification link.`), 202 (pending), 401 (`Invalid credentials.`), 404
(`Verification not supported by this provider.`).

### 2. Laravel validation (422)
Used by login (`email`/`password`), forgot-password (`email`), reset-password
(`email`, `password` min:8), user store/update, report store/update/move/status,
comment store/update, media uploads, and **every grammar 422**:

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "url": ["The url field is required."],
    "filter.status": ["Unknown status or status group [x]."]
  }
}
```

### 3. Plain message (all other failures)
```json
{ "message": "Unauthenticated." }              // 401 — missing token / token_version mismatch
{ "message": "Invalid or expired token." }     // 401 — bad signature / expired
{ "message": "Forbidden." }                    // 403 — policy gate (checkUser)
{ "message": "Admin access required." }        // 403 — non-admin on /user
{ "message": "Feature disabled." }             // 403 — disabled feature endpoint
{ "message": "Invalid status transition." }    // 403 — status lifecycle/role rule
{ "message": "Forbidden origin." }             // 403 — guest origin not allowed / cookie-Origin mismatch
{ "message": "Screenshot not found." }         // 404
{ "message": "Video not found." }              // 404
{ "message": "CSRF token mismatch." }          // 419
{ "message": "Too many requests." }            // 429 — guest limiter
{ "message": "Cannot demote or deactivate the last remaining admin." }  // 422
{ "message": "Cannot delete the last remaining admin." }                // 422
```

Other 404s (route-model binding, `findOrFail`, `checkParent`) use Laravel's
default 404 body; `checkParent` aborts with no message (empty message string
in JSON).

## Rate limits

Defined in the backend service provider; all keyed per IP:

| Limiter | Default | Knob | Applies to |
|---|---|---|---|
| `redline-bootstrap` | 120/min | `REDLINE_BOOTSTRAP_THROTTLE` | `GET /bootstrap` |
| `redline-auth` | 10/min | `REDLINE_AUTH_THROTTLE` | register, login, verify, forgot-password, reset-password |
| `redline-guest` | 20/min | `REDLINE_AUTH_GUEST_THROTTLE` (`redline.auth.guest_throttle`) | anonymous `POST /report` in guest mode |

- Route-level limits (`throttle:redline-bootstrap`, `throttle:redline-auth`)
  are Laravel's `throttle` middleware: **429 with a `Retry-After` header**
  (seconds), body `{ "message": "Too Many Requests" }`.
- The guest limiter is enforced inside `RedlineApiAuth` and returns
  `{ "message": "Too many requests." }` with **no** `Retry-After` header.

## Signed-URL failures

`GET /auth/verify` and `POST /auth/reset-password` sit behind Laravel's
`signed` middleware. A tampered or expired signature is rejected by the
framework with **403** before the controller runs (Laravel default handling
for `InvalidSignatureException`). The frontend treats a failed reset as "link
is invalid or has expired".

## CSRF failure

Cookie-authenticated state-changing requests (POST/PATCH/DELETE/PUT) must
echo the `redline_csrf` cookie in the `X-Redline-CSRF` header. Missing or
mismatched → **419** `{ "message": "CSRF token mismatch." }`. A mismatched
`Origin` header is rejected earlier with **403** `{ "message": "Forbidden origin." }`
(defense-in-depth). See `auth.md`.