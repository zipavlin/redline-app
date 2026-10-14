# Redline API Contract - version 2

This directory is the **contract source** for the Redline frontend
(`redline-app`: widget + dashboard). It is the authoritative statement of what
any Redline backend **must** implement for the frontend to work. The contract
is extracted from the *actual implemented code* - the current backend
(`redline-laravel`, Composer package `zipavlin/redline`) is the reference
implementation - never invented from a design doc.

## Ownership

- This is a **consumer contract**: it describes what `redline-app` requires of
  ANY backend that claims to be a Redline API, independent of storage driver,
  auth provider, or host framework.
- `redline-laravel` is currently the **only** implementation, and the only one
  this contract has been verified against (routes, controllers, middleware,
  query grammar, config read directly from its source).
- The backend is swappable in parts (storage provider, guard provider, auth
   provider) but the **HTTP surface** documented here is fixed for version 2.
- Anything the contract marks **"not yet implemented"** is a known gap in the
  backend - the frontend may carry transport/types for it, but no current
  backend satisfies it. Do not treat those as contract requirements yet.

## Versioning policy

- The contract is versioned as an integer carried in the public bootstrap
   payload: `GET /{api}/bootstrap` returns `"version": 2`.
- **Minor (1.x-style, contract-compatible)**: additive changes only - new
  optional request fields, new include targets, new filters, new endpoints
  that the frontend can ignore - plus **relaxed access gates** (letting more
  callers use an existing endpoint, e.g. opening a LIST to any authenticated
  user). Backends may ship these independently.
- **Major (2.0)**: any breaking change - renamed/removed fields, changed
  status codes or envelopes, a **tightened** access gate or otherwise altered
  auth semantics that break an existing conforming caller, removed endpoints.
  Major versions require **coordinated releases across the backend and the
  frontend**, and the bootstrap `version` integer is bumped.
- The current frontend does **not yet compare** the bootstrap `version` to a
  client expectation (no version gate is implemented); it fails closed only on
  unreachable/malformed payloads. Version-gating is reserved for future
  contract checks.

## How to update this contract

1. Change the backend first, then the frontend, or vice versa - the contract
   must always match what BOTH sides actually do.
2. Re-extract from code, not from memory: `routes/api.php`, the API
   controllers, `src/Http/Query/QuerySchema.php`, `config/redline.php`, the
   auth/CSRF middleware, and the frontend's `src/core/api/*`,
   `src/core/bootstrap.ts`, and `src/resources/*/api.ts` + model types.
3. Bump `version` in `BootstrapController::index()` (and this directory) only
   on a breaking change.
4. Flag every drift between this contract and the code in the change notes -
   the contract is only worth what it traces to.

## Files in this directory

| File                    | Contents                                                             |
|-------------------------|----------------------------------------------------------------------|
| `README.md`             | This file - ownership, versioning, contribution, file map            |
| `api.md`                | Complete endpoint reference (method, path, auth, body, response, errors) |
| `query-grammar.md`      | The generic `filter[]/include[]/sort[]/paginate[]/aggregate[]/group_by[]` grammar |
| `bootstrap.md`          | The public bootstrap payload + consumer fail-closed behavior         |
| `bootstrap.schema.json` | JSON Schema (draft 2020-12) for the `BootstrapResponse` shape        |
| `errors.md`             | Error envelope formats, status codes, rate-limit behavior            |
| `auth.md`               | Authentication contract: JWT cookie, double-submit CSRF, Bearer, guest mode |

## Conventions used throughout

- All field names are **snake_case**, exactly as the API returns them.
- `{api}` in a path means the API base URL: `/{redline.path}/api`
  (default `/redline/api`). Host config: `REDLINE_PATH` / `config('redline.path')`.
- Every claim below traces to the implementation read for version 2.
