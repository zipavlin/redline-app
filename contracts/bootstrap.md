# Bootstrap Payload — `GET /{api}/bootstrap` (v1)

Public, read-only capability manifest. No auth, no CSRF; rate-limited
(`throttle:redline-bootstrap`, default 120/min per IP,
`REDLINE_BOOTSTRAP_THROTTLE`). The widget fetches it on every host page load;
the dashboard fetches it at mount before booting the SPA.

No secrets or request data — only capability flags and config names.

## Payload

```json
{
  "version": 1,
  "features": ["screenshots", "videos", "files", "comments", "mentions"],
  "capabilities": {
    "guest_reporting": false,
    "auth": {
      "can_login": true,
      "can_register": true,
      "fields": [],
      "can_select_role": true,
      "requires_approval": false,
      "requires_email_verification": false
    },
    "mail": { "configured": false }
  },
  "csrf": { "cookie": "redline_csrf", "header": "X-Redline-CSRF" }
}
```

## Fields

| Field | Type | Default (OpenAuthProvider, no config) | Description |
|---|---|---|---|
| `version` | integer | `1` | Contract version. Bumped only on breaking contract changes |
| `features` | string[] | all five | Enabled feature flags; any of `screenshots`, `videos`, `files`, `comments`, `mentions` (missing = disabled via `REDLINE_DISABLED`) |
| `capabilities.guest_reporting` | boolean | `false` | `redline.auth.guest` — anonymous report submission allowed |
| `capabilities.auth.can_login` | boolean | `true` | `AuthProvider::canLogin()` (false for CloudAuthProvider) |
| `capabilities.auth.can_register` | boolean | `true` | `AuthProvider::canRegister()` (false for closed/cloud) |
| `capabilities.auth.fields` | array of field descriptors | `[]` | Extra provider-specific registration fields rendered by the widget/dashboard. Descriptor: `{ "name": string, "type": "string"\|"number"\|"password"\|"pin", "label"?, "placeholder"?, ... }` (index-signature; structural) |
| `capabilities.auth.can_select_role` | boolean | `true` | Whether the role selector is shown (false e.g. PinAuthProvider) |
| `capabilities.auth.requires_approval` | boolean | `false` | New accounts start `pending` until an admin approves |
| `capabilities.auth.requires_email_verification` | boolean | `false` | Registration holds the account pending until the emailed link is clicked (DomainAuthProvider) |
| `capabilities.mail.configured` | boolean | `false` | Whether a real mailer is configured (`mail.default` not log/array/null, and `REDLINE_MAIL` not false). Gates email-dependent actions (verification, forgot-password, invitations, notifications) |
| `csrf.cookie` | string | `redline_csrf` | The double-submit CSRF cookie name |
| `csrf.header` | string | `X-Redline-CSRF` | The CSRF header that must echo the cookie on cookie-authenticated state changes |

## Consumer behavior (fail-closed)

`fetchBootstrap()` (frontend `src/core/bootstrap.ts`) returns `null` on **any**
failure — network rejection, non-ok HTTP status, or a malformed body (`data`
missing, `features` not an array, or `capabilities`/`csrf` absent). It never
throws. On `null` (or before bootstrap resolves) the runtime keeps the
**fail-closed defaults**:

| Runtime key | Fail-closed default |
|---|---|
| `features` | `[]` (all features appear disabled) |
| `guest` (guest_reporting) | `false` |
| `canLogin` | `true` (login stays available for local auth providers) |
| `canRegister` | `false` (no self-registration shown) |
| `requiresApproval` | `false` |
| `mailConfigured` | `false` |
| `fields` | `[]` (only name/email/password rendered) |
| `csrfCookie` / `csrfHeader` | element attribute hint / `redline_csrf` / `X-Redline-CSRF` |

**Version mismatch:** the current consumer does **not** implement a version
gate — `version` is carried in the payload for future contract checks but is
not compared at mount. Fail-closed behavior is triggered only by unreachable
or malformed payloads. (Version-gating is reserved for a future major
contract.)

On success, `applyBootstrap()` folds exactly the known keys onto the runtime
config and — for the cookie transport — repoints the CSRF cookie/header names
at the server-advertised ones. Transport/placement config (`api`, `dashboard`,
`theme`, `position`, `expanded`) always comes from the host element
attributes, never from bootstrap.

## JSON Schema

See `bootstrap.schema.json` (JSON Schema draft 2020-12).