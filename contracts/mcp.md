# Redline MCP Server (v2)

Base URL: `{mcp}` = `/{redline.path}/api/mcp`, default `/redline/api/mcp`
(host knob `REDLINE_PATH` / `config('redline.path')`).

An additive MCP (Model Context Protocol) surface on top of the v2 HTTP API. It
lets AI agents (Claude Code, OpenCode, Codex) read and write Redline reports
through the same data model and permission model the HTTP endpoints expose. The
MCP surface is additive, so the wire version **stays 2**: per the versioning
policy in `README.md`, additive changes (new optional request fields, new
filters, new endpoints the frontend can ignore) are contract-compatible and may
ship without a coordinated release. The bootstrap payload is unchanged - no new
bootstrap field and no `version` change (see `bootstrap.md`).

No non-laravel backend implements this surface: `redline-laravel` (Composer
package `zipavlin/redline`), built on the official `laravel/mcp` package, is
the reference implementation. The document describes what ANY backend claiming
MCP support must do, not just today's implementation - and every claim below
traces to this specification; anything not specified here is marked as such
rather than asserted.

## 1. Endpoint and transport

One endpoint: `{mcp}` = `/{redline.path}/api/mcp` (default `/redline/api/mcp`).

- **Transport** - Streamable HTTP per the `laravel/mcp` transport: JSON-RPC 2.0
  requests over `POST`. The transport middleware set is auto-attached by the
  package (`ReorderJsonAccept`, `ValidateMcpHeaders`, `AddWwwAuthenticateHeader`
  - the last one adds `WWW-Authenticate: Bearer` to 401 responses).
- **Bearer-only by construction** - no session or cookie middleware sits on the
  route, and there is no CSRF step: the double-submit CSRF in `auth.md` binds
  only to cookie-authenticated requests. See section 2.
- **Rate limits and the gates** - pinned middleware order. The first two wrap
  the route group, so they run ahead of the package's own transport middleware
  and apply to every request method on the URI:

  | Order | Middleware | Purpose |
  |---|---|---|
  | 1 | `RedlineActive` | guard gate, FIRST: an inert host guard answers `404` before any limiter runs or authentication is attempted |
  | 2 | `RedlineMcpEnabled` | per-request `mcp` feature gate: a disabled feature answers `404` for every method, even from a stale route cache |
  | 3 | `throttle:redline-mcp-ip` | per-IP, pre-auth, 240/min default - flood/log-noise control, not brute-force defence |
  | 4 | `RedlineApiAuth` | bearer authentication (section 2) |
  | 5 | `throttle:redline-mcp` | per-user, 120/min default, keyed `user id ?? IP` |

  Over either limit the response is `429` in the Laravel throttle shape - see
  `errors.md`.

**Feature gate - the route can be absent.** The route is registered only when
the host enables the `mcp` feature. Features are opt-in in this contract
version: `REDLINE_FEATURES` (comma-separated feature names; an empty default
enables nothing) plus the `redline:enable` artisan command, which lists and
toggles features and writes that env var. When `mcp` is not enabled the route
is never registered, so clients get an ordinary Laravel default `404` (see the
bodies below). When it is enabled, the
bootstrap `features` array includes `"mcp"` - a name the current frontend
ignores; `features` stays `string[]` (see `bootstrap.md`).

This opt-in model is the contract-wide one: it replaces the older subtractive
`REDLINE_DISABLED` model, and it is stated identically in `bootstrap.md`,
`bootstrap.schema.json` and `api.md` - a feature is enabled if and only if its
name is listed in `REDLINE_FEATURES`.

**What a `404` looks like, and `405`.** The `404` body depends on which of the
three outcomes produced it - they do NOT all look alike:

| 404 cause | Body |
|---|---|
| The route was never registered (the `mcp` feature is off and no route cache holds it) | Laravel's default 404 envelope, as in `errors.md` (`{ "message": "" }` with `app.debug=false`) |
| The host guard is inert (`RedlineActive`, order 1) | Laravel's default 404 envelope - the middleware calls `abort(404)` with no message, so it renders exactly the shape pinned in `errors.md` |
| A cached route outlives a feature that is now off (`RedlineMcpEnabled`, order 2, re-checks the feature per request) | `{ "message": "Not found." }` |

None of these confirm whether the endpoint exists, and they apply to every
method. The URI accepts `POST` only: once both gates
pass, `GET` and `DELETE` on it answer `405` with `Allow: POST`.

## 2. Authentication - bearer `rlm_` tokens

### Token format

| Property | Value |
|---|---|
| Format | `rlm_` + 40 hex characters (`random_bytes(20)`) |
| Storage | unsalted SHA-256 hex of the plaintext; the plaintext itself is returned **once**, at creation, and never stored |
| Hashing | no bcrypt - the token is high-entropy, so a hash suffices |
| Transport | `Authorization: Bearer <token>` header - **only** |

Accepted **only** from the `Authorization: Bearer <token>` header - never from
a cookie and never from a query string. An `rlm_`-shaped cookie value or a
query-string token is **rejected with 401** - explicitly rejected, not silently
ignored. This is consistent with the existing query-string-token stance in
`auth.md` ("Not yet implemented"). No CSRF step applies (see section 1).

### Acquisition - artisan only

There are **no HTTP token endpoints** in this version: tokens are created and
revoked on the server only, through `php artisan redline:mcp`. Run bare, the
command is an interactive wizard: pick an approved non-guest user, then add a
token - printing the chosen agent's copy-paste setup block - or revoke one from
the active-token roster (each row shows its agent and a last-4 hint). The same
surface is scriptable with flags:

| Command | Effect |
|---|---|
| `php artisan redline:mcp` | interactive wizard - user select, token roster (agent + last-4 hint), add/revoke, agent setup block |
| `php artisan redline:mcp --list --user=<email>` | list that user's tokens (name, hint, created, last used) |
| `php artisan redline:mcp --revoke={id}` | soft-revoke one token (sets `revoked_at`) |
| `php artisan redline:mcp --revoke-all --user=<email>` | revoke every token of a user |
| `php artisan redline:mcp --user=<email> --name=<label>` | non-interactive create; `--name=` labels the token, or names an agent whose setup block is printed |

The command refuses guest and pending users - no token is ever issued to them.
Its output carries this warning, quoted verbatim:

> This token acts with the user's full permissions - treat it as a password;
> it is NOT invalidated by logout; it IS invalidated by that user's password
> change.

### Capabilities

A token carries the **user's full permissions** - the whole REST surface, no
scopes, no reduced mode. The role gates apply exactly as for a cookie/bearer
JWT session (`auth.md`):

| Gate | Same as HTTP |
|---|---|
| developer+ for browser metadata and emails | developer+ (admin counts as developer) |
| author-only body edits | author only |
| owner / developer+ for status and media | developer+ or owner |
| admin-only `/user` endpoints (`GET /user` LIST excepted) | admin only |

### Lifecycle and revocation

| Event | Effect on a token |
|---|---|
| `--revoke={id}` / `--revoke-all` | soft revocation (`revoked_at` set); later uses are 401 |
| Plain logout | **not** invalidated - a PAT is not a session credential |
| That user's password change | **invalidated** - a per-user password-change epoch is snapshotted at token creation; a password change makes every older token 401 |
| Token user becomes pending/guest | 401 - guests and pending users never reach the route |
| Every use | `last_used_at` / `last_used_ip` are recorded |
| `redline:remove` | destroys the token table along with the host database - tokens are per-host rows, so an N-host install needs N tokens for the same person |

Session-coupled revocation is provider-dependent. Under a host-session provider
(`LaravelAuthProvider`) the host application's logout does **not** invalidate
the token either - the token outlives the host session. This mirrors the
pre-existing asymmetry already noted for JWTs; it is stated here rather than
papered over.

### Failure responses

All token failures are `401` with the `WWW-Authenticate: Bearer` header
(added by `AddWwwAuthenticateHeader`), in the existing plain
`{ "message": ... }` envelope - see `errors.md`:

```json
{ "message": "Unauthenticated." }
{ "message": "Invalid or expired token." }
```

The same bearer is accepted by the existing HTTP endpoints, including the
screenshot/video binary URLs - so a tool that returns a binary URL hands the
agent a URL that works when fetched with the same `Authorization: Bearer`
header. There are no query-string tokens - the known ambiguity in `auth.md`
stands.

## 3. Tools

### Conventions

- All tool inputs and outputs are JSON; field names are snake_case.
- Report addressing: a `report` input (UUID string) or a `url` input whose
  trailing UUID is parsed into a report id. Either may be supplied wherever a
  tool needs a report; an unknown or unparseable address is an actionable tool
  error - never a silent empty result.
- Collection outputs reuse the HTTP pagination envelope
  `{ "data": [...], "meta": { "total", "per_page", "current_page", "last_page" } }`
  (see `query-grammar.md`).
- Tool names follow the model-action scheme `<resource>_<action>` - the resource
  first, the action second: `report_list`, `report_get`, `report_create`,
  `report_update_status`, `comment_list`, `comment_create`, `screenshot_get`,
  `user_list`.
- Errors are actionable messages - see section 4.

### `report_list` - compact report list for triage

Inputs:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `url` | string | no | - | filter by report URL |
| `location` | string | no | - | filter by location |
| `status` | enum string | no | - | report status |
| `priority` | enum string | no | - | `low\|normal\|high\|critical` |
| `mine` | boolean | no | - | scope to the token user's own reports |
| `search` | string | no | - | matches `body` / `location` |
| `sort` | string | no | - | |
| `per_page` | integer | no | - | **clamped to 50** - a value above 50 is clamped, a non-numeric value is rejected with an actionable validation error (section 4) |
| `page` | integer | no | - | |

Output: the pagination envelope whose rows are compact - they **exclude
`body`**: `id`, `title`, `status`, `priority`, `url`, `location`, `created_at`,
`due_at`, the author name, and counts - plus `meta.total`.

Errors: an unknown filter key or an invalid enum value is the grammar's
422-equivalent actionable error (see `query-grammar.md` and section 4).

### `report_get` - full single-report read

Inputs:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `report` | string (UUID) | one of `report`/`url` | - | report id |
| `url` | string | one of `report`/`url` | - | trailing UUID parsed into the report id |
| `mark_noticed` | boolean | no | `false` | when `true`, performs the `new` → `noticed` transition explicitly |

**Pure read: unlike the HTTP `GET /report/{report}`, this tool does NOT perform
the `new` → `noticed` auto-acknowledge side effect** (see `api.md`). The
optional `mark_noticed` input performs that transition explicitly when `true`.

Output: the core report fields plus `pin`, `element`, browser metadata
serialized through the same boundary as HTTP (`user_agent` is **always**
stripped - see section 4), the author, the members, media metadata including
the video entry (`id`, `url` - the video model carries nothing else) and
`comments_count`. `due_at` follows the existing UTC-normalization semantics
(`api.md`).

Errors: an unknown or unparseable address is an actionable not-found error.

### `screenshot_get` - fetch the report's screenshot as an image

Inputs: `report` / `url`, as in `report_get`. Returns the report's screenshot
image only - there is no image equivalent for the video (see "Deliberate
omissions" below).

Size gate:

| Condition | Result |
|---|---|
| image ≤ ~2 MB | returned inline as image content |
| image > ~2 MB | not inlined - the tool returns the screenshot metadata plus the authenticated binary URL to fetch separately |

The cutoff is honest about cost: a 5 MB PNG base64-encodes to ~6.7 MB of agent
context, so larger images are handed over as a URL instead of inlined.

Errors: no screenshot attached - actionable not-found error.

### `comment_list` - comment list for a report

Inputs:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `report` | string (UUID) | one of `report`/`url` | - | report id |
| `url` | string | one of `report`/`url` | - | trailing UUID parsed into the report id |
| `per_page` | integer | no | - | **clamped to 50** - a value above 50 is clamped, a non-numeric value is rejected with an actionable validation error (section 4) |
| `page` | integer | no | - | |

Output: the pagination envelope of rows `id`, author name, `body`,
`created_at` - oldest first.

Errors: an unknown or unparseable address is an actionable not-found error.

### `report_create` - create a report

Inputs:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `url` | string | **yes** | - | ≤ 2048 (HTTP parity); must be an absolute http(s) URL - the full page address including origin |
| `body` | string | **yes** | - | sanitized with the same HTML allowlist as HTTP |
| `priority` | enum string | no | `normal` | `low\|normal\|high\|critical` |
| `pin` | object | no | - | percentage coordinates: `x` and `y` required together, each 0..100, measured from the top-left of the captured area; `prefer_selector` optional boolean; `scroll_x` / `scroll_y` optional numbers |
| `element` | string | no | - | a stable CSS selector for the affected element, ≤ 512 characters |

`element` is a CSS selector in `document.querySelector` syntax that locates the
affected element on the reported page - for example `#checkout-total` or
`form.checkout button[type="submit"]`. Prefer a selector that is precise and
stable (an id, a stable `data-` attribute, or a short structural path) over
generated or hashed class names, and verify it against the live page - open the
URL in a browser when you can - before sending it. Omit `element` when no
reliable selector can be determined: a wrong selector is worse than none. The
value is limited to 512 characters; a longer one is rejected with the normal
422 validation shape (section 4).

`location` is not an input. The server derives the stored `location` (the page
grouping key) from `url`: its path plus content-defining query params, with
`redline-*` params and analytics/tracking params removed and the remainder
sorted, so MCP-filed reports group identically to widget reports. A `location`
argument, if sent, is ignored.

`pin` places a marker at percentage coordinates: `x` and `y` are numbers 0..100
from the top-left of the captured area (percentages, never pixels), and they are
required together - send both or neither. Use `pin` when the issue is an area of
the page rather than a single element, or together with `element` to mark the
spot where that element sat.

Output: the created report's `id` and its `url`.

Screenshot/video upload is **not** part of this tool - an agent attaches media
through the existing HTTP upload endpoints (see `api.md`) with the same bearer
token.

Errors: validation failures - a missing or oversized `url` / `element`, a `url`
that is not an absolute http(s) address, an unknown `priority` value, or invalid
`pin` coordinates - arrive as actionable 422-equivalent messages (section 4).

### `comment_create` - add a comment to a report

Inputs:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `report` | string (UUID) | one of `report`/`url` | - | report id |
| `url` | string | one of `report`/`url` | - | trailing UUID parsed into the report id |
| `body` | string | **yes** | - | sanitized |

Output: the created comment's `id`.

Errors: an unknown or unparseable address is an actionable not-found error.

### `report_update_status` - move a report through the status lifecycle

Inputs:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `report` | string (UUID) | one of `report`/`url` | - | report id |
| `url` | string | one of `report`/`url` | - | trailing UUID parsed into the report id |
| `status` | enum string | **yes** | - | `new\|noticed\|progress\|resolved\|done` |

The lifecycle chain and per-role allowed targets are exactly the HTTP ones
(`api.md`):

- chain: `new ↔ noticed ↔ progress ↔ resolved ↔ done`, plus `noticed ↔ resolved`
- developers/admins → `noticed|progress|resolved`; reporter/owner → `progress|done`

A rejected transition returns the allowed-targets list for the caller's role as
an actionable error. Output: the updated report row.

Errors: an illegal transition is an actionable 403-equivalent message; an
unknown `status` value is a validation error.

### `user_list` - compact user list for member resolution

Inputs:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `per_page` | integer | no | - | **clamped to 50** - a value above 50 is clamped, a non-numeric value is rejected with an actionable validation error (section 4) |
| `page` | integer | no | - | |

Output: compact rows - `id`, `status`, `created_at`, `name`, `role` - for the
users this token may see, through the same visibility gates as the HTTP user
list (guest and pending users are forbidden). `email` is added for developer
tokens only.

Use it to resolve a person to their `id` before assigning them as a report
member. Anything the compact shape does not cover - filtering by name, sorting -
stays available through the HTTP `GET /user` list, which keeps its query grammar
and accepts the same bearer token.

Errors: the standard auth and policy failures (section 4).

### Deliberate omissions of this version

- **`video_get` intentionally does not exist.** The video metadata is not worth
  a separate round trip: the video row carries only `id` and `url`, both folded
  into the `report_get` output. The omission is deliberate - do not read its
  absence as a gap.
- **Deferred to a future contract version:** priority and due-date setters, and
  HTTP token-management endpoints. They are explicit non-goals of this version;
  nothing above implies them.

## 4. Error semantics

MCP errors surface the same categories as the HTTP API and reuse its vocabulary
(`errors.md`):

| Condition | Category |
|---|---|
| Missing / bad / revoked token; token user pending or guest | 401 unauthenticated/bad token, with `WWW-Authenticate: Bearer` |
| Forbidden policy gate, disabled feature, invalid status transition | 403 forbidden |
| Unknown report / comment / screenshot | 404 not found |
| Validation failure, unknown filter key, invalid enum value | 422 validation + grammar |
| IP or user rate limit exceeded | 429 rate limited |
| Per-role visibility gates (below) | not errors - applied exactly as on HTTP |

Inside MCP these arrive as **actionable tool-error messages carrying the same
text** - never as silent empty successes. An unknown filter key or an invalid
status must never look like "no rows".

Per-role visibility gates match the HTTP gates:

- `user_agent` is **never** exposed on any surface.
- Emails appear only where the HTTP gates already allow them: the `author`
  include's `email` attribute (any approved reporter - see `api.md`) and
  `user_list`'s per-row `email` for developer tokens. Expanded browser metadata
  stays behind the developer+ `browser` include gate.
- Unknown/unauthorized requests are never silently broadened.

**Feature gating:** the route is gated only by the `mcp` feature (section 1).
Beyond that every tool mirrors its HTTP counterpart exactly: `comment_list`
and `screenshot_get` perform no feature check, because the corresponding HTTP
`GET` endpoints perform none, while `comment_create` and `report_create` go
through the shared actions layer and are subject to the same feature gates as
the HTTP `POST` endpoints.

## 5. Version and compatibility

The wire version **stays 2**. The MCP surface is additive: the bootstrap
payload is unchanged and no coordinated frontend release is needed. Per the
versioning policy in `README.md`: additive changes - new optional request
fields, new filters, new endpoints the frontend can ignore - are
contract-compatible and may ship without a coordinated release. Adding tools or
inputs later in the same additive spirit does **not** bump the version.

A tightening - a removed tool, a removed field, changed auth semantics, a
tightened gate - is a **major** change and bumps the version per `README.md`.
