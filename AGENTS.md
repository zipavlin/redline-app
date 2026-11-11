# AGENTS.md - Redline App (frontend)

<!-- bmad:context -->
<!-- Verified 2026-11-10 against 7fdacf7. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## redline-app

Frontend for Redline: the widget (floating Shadow-DOM bug-report toolbar for host pages) and the dashboard (standalone review SPA). Vue 3 + TypeScript, Vite, Nuxt UI v4; npm package `redline-app`, `"private": true` — never published to npm. Backend: sibling `redline-laravel` (owned builds + handoff boundary, below).

## Policy

- Contract source of truth: `contracts/` (currently version 3, 8 files). Breaking changes bump the contract version together with the backend wire version in `BootstrapController` and the parent `manifest.yaml`.
- The built IIFE bundles in `dist/` → `public/` handoff are the release boundary (see parent); no `window.RedlineDashboard` API promises.

## Where things are

- Both entries build from one `vite.config.ts` (REDLINE_TARGET passes); TipTap/ProseMirror packages must stay in both `resolve.dedupe` and `optimizeDeps.include` — two copies throw plugin-key errors.
- Layering is enforced by `.dependency-cruiser.cjs`: downward only — `domain/` ← `core/` ← `resources/` ← `store/` ← `components/`, with `composables/` usable by `resources/`, `store/`, `components/`. No new top-level layer without updating the config.
- Cross-documentation and handoff details live below in the long-form sections (architecture, testing quirks, conventions).

## Running and verifying

- Verify in order: `npm run type-check && npm run test && npm run lint:boundaries`, then `npm run build`. Vitest runs on happy-dom from `tests/` only.
- CI: `.github/workflows/ci.yml` (type-check, test, boundaries, build) + weekly dependabot. There is no release workflow on disk.

## Conventions that differ from defaults

- Element attributes carry only transport/placement config (`api`/`dashboard`/`csrf`/`theme`); everything else comes from the bootstrap endpoint and fails closed.
- Aggregate numbers come only from the generic `/aggregate` endpoint; dark mode is driven by `store.settings.theme` (widget sets `.dark` on its shadow wrapper, dashboard on its `<html>`, Nuxt UI `colorMode: false`).

## Known pitfalls

- Test-file counts drift between releases — trust the run, not stored numbers.
- `npm ci` from a lockfile regenerated on npm < 11.3 drops other-platform native bindings and breaks Linux CI; regenerate only from a clean state with npm ≥ 11.3.

<!-- /bmad:context -->

Frontend for Redline (public repo `github.com/zipavlin/redline-app`): the **widget**
(a floating bug-reporting toolbar embedded in host pages) and the **dashboard** (a
standalone review SPA). Vue 3 + TypeScript + Vite 8 + Nuxt UI v4. npm package
`redline-app`, `"private": true` - **not published to npm**. Backend lives in the sibling
**redline-laravel** repo (see "Related repositories").

> These docs were written for the **post-split repositories**: this repo holds only the
> frontend, extracted out of a legacy monorepo. Facts below were verified against the
> current code, not the legacy docs.

## CI

- `.github/dependabot.yml` - weekly update PRs for npm and GitHub Actions dependencies.
- `.gitignore` no longer excludes `/.github`.

## Architecture

### Two IIFE bundles from one config

`vite.config.ts` builds two entries, one per `REDLINE_TARGET` pass (Vite lib+IIFE allows
one entry per pass). Dev serves both as ESM from a single process.

- **Widget** (`src/widget.ts`) - Vue Custom Element registered as `<redline-widget>`,
  rendered in **Shadow DOM** (no Tailwind prefix, no style bleed). No router. Widget CSS
  is imported via `css/redline.css?inline` and injected into the shadow root - the
  bundle is self-contained, **no separate widget CSS file**.
- **Dashboard** (`src/dashboard.ts`) - standalone Vue SPA with `vue-router`
  (`createWebHistory`), embedded as the native custom element `<redline-dashboard>` with
  attributes (`api`/`dashboard`/`csrf`/`theme`). Keeps its global stylesheet link
  (`css/redline-dashboard.css`) and drives dark mode on its own `<html>`. No explicit
  `window.RedlineDashboard` assignment and no `redline:ready`/`redline-dashboard:ready`
  handshake (the IIFE wrapper creates a `window.RedlineDashboard` var purely as a build
  artifact - not part of the API).

Alias `@` → `src/`. Both apps use Nuxt UI's `ui()` plugin (Tailwind processing +
auto-imported `U*` components); `auto-imports.d.ts` and `components.d.ts` are generated
and **gitignored** - regenerated on first `npm run dev` / `npm run build`.

### Layering (enforced by `.dependency-cruiser.cjs`)

Dependency direction is **downward only** (`npm run lint:boundaries` verifies):

```
domain/      ← leaf (pure logic, no DOM/I/O)
core/        → domain/                       (browser I/O: capture, selectors, storage, API transport)
resources/   → core/, domain/, composables/  (per-resource data: auth/report/comment/screenshot/user/video)
store/       → resources/, domain/, core/, composables/
components/  → everything
```

`composables/` is its own layer that `resources/`, `store/`, and `components/` may
import. Cross-resource imports within `resources/` are allowed. **Do not invent a new
top-level layer** without updating `.dependency-cruiser.cjs`.

### Data layer

- Per-resource folders under `src/resources/` (model types, api calls, query/mutation
  composables, cache keys together).
- Active report/comment data lives in **Pinia stores** (`src/store/`); lists/aggregates +
  comments go through **TanStack Query**.
- Aggregate numbers come **only** from the generic `/aggregate` endpoint - there are no
  dedicated overview endpoints.

### API consumption

- Element attributes carry **only transport/placement config** (`api`/`dashboard`/`csrf`/
  `theme`, plus widget `position`/`expanded`). Everything else (features, guest mode,
  auth provider fields, mail status) is fetched at mount from the public
  `GET /{path}/api/bootstrap` and **fails closed** (empty features, no registration, …)
  when unreachable.
- `src/core/api/client.ts` + transports: `CookieTransport` (same-origin; sends
  credentials; echoes the `redline_csrf` cookie as `X-Redline-CSRF` on non-GET) vs
  `BearerTransport` (cross-origin/cloud; `Authorization: Bearer` from
  sessionStorage `redline_cloud_token`). Names are updated from the bootstrap payload.

### Vite gotchas

- **TipTap/ProseMirror must be dedup'd.** `vite.config.ts` lists ~15 PM packages in both
  `resolve.dedupe` and `optimizeDeps.include`. Two copies of `prosemirror-state` (each
  with its own plugin-key counter starting at `"plugin$"`) throw
  `"Adding different instances of a keyed plugin"` when combined in one editor. If you
  add a TipTap/PM-related dep, add it to **both** lists.
- **`colorMode: false`** in the Nuxt UI plugin - both apps drive dark mode from
  `store.settings.theme`. The widget sets `.dark` on its shadow wrapper (never touches
  host `<html>`); the dashboard sets `.dark` on its own `<html>`.
- Nuxt UI `router: isDashboard || mode === 'development'` - dev always enables the
  router override so the dashboard's nav uses vue-router links while both entries are
  served from one config.
- `publicDir: false`, `outDir: 'dist'`, `emptyOutDir: false` (each target pass leaves the
  other's artifacts in place).

## Testing quirks

- Vitest with `happy-dom` (covers location/cookie/localStorage access); includes
  `tests/**/*.test.{js,ts}` only.
- Watch-mode `server.watch.ignored` excludes `docs/`, `node_modules/`, `tests/`,
  `dist/` - do not rely on the dev server to reload tests.

## Conventions

- EditorConfig: LF line endings, 4-space indent, UTF-8.
- TypeScript strict via `tsconfig.json`; `@` alias for `src/`.
- Do not import `core/` from `domain/`; do not reach into `store/`/`components/` from
  `resources/` (depcruise enforces this).

