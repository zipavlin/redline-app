# AGENTS.md - Redline App (frontend)

Frontend for Redline (public repo `github.com/zipavlin/redline-app`): the **widget**
(a floating bug-reporting toolbar embedded in host pages) and the **dashboard** (a
standalone review SPA). Vue 3 + TypeScript + Vite 6 + Nuxt UI v4. npm package
`redline-app`, `"private": true` - **not published to npm**. Backend lives in the sibling
**redline-laravel** repo (see "Related repositories").

> These docs were written for the **post-split repositories**: this repo holds only the
> frontend, extracted out of a legacy monorepo. Facts below were verified against the
> current code, not the legacy docs.

## Commands

```
npm run dev               # Vite dev server :5173, serves BOTH entries as ESM
npm run build             # both IIFE bundles (widget, then dashboard) → dist/
npm run build:widget      # widget only (REDLINE_TARGET=widget)
npm run build:dashboard   # dashboard only (REDLINE_TARGET=dashboard)
npm run dev:build-widget  # unminified widget build (development mode)
npm run dev:build-dashboard
npm run test              # vitest run (happy-dom, tests/**/*.test.{js,ts})
npm run test:watch        # vitest watch mode
npm run type-check        # vue-tsc --noEmit (clean at extraction time)
npm run lint:boundaries   # depcruise layering enforcement (.dependency-cruiser.cjs)
```

### Combined verification order
```
npm run type-check && npm run test && npm run lint:boundaries
```

## Test status (current baseline)

- **25 test files** (`tests/`, ~182 tests at extraction time) - happy-dom via vitest,
  `globals: true`. Note: tests live in `tests/`, **not** co-located under `src/`; there
  are no tests under `src/`.
- `npm run type-check` is **clean** in this extraction (vue-tsc --noEmit).

## CI

- `.github/workflows/ci.yml` - runs on push to `main` and on pull requests:
  `npm ci` → `npm run type-check` → `npm run test` → `npm run lint:boundaries` →
  `npm run build`; on pushes to `main` it uploads `dist/` as a GitHub Actions artifact
  (temporary, not consumed automatically yet).
- `.github/workflows/release.yml` - runs on tags matching `v*`: builds and creates a
  GitHub Release attaching `dist/redline.js`, `dist/redline-dashboard.js`,
  `dist/redline-dashboard.css` (no separate widget CSS - it is inlined). The Laravel
  asset handoff (copying these into redline-laravel/public/) is still a manual step.
- `.github/dependabot.yml` - weekly update PRs for npm and GitHub Actions dependencies.
- `.gitignore` no longer excludes `/.github`.

## API contract

The consumer-side API contract lives in `contracts/` (contract version 1: README.md,
api.md, query-grammar.md, bootstrap.md, bootstrap.schema.json, errors.md, auth.md) - the
contract a backend must satisfy.

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
- `package-lock.json` IS committed; install with `npm ci` for reproducibility. Regenerate with `npm install` from a clean state (`rm -rf node_modules package-lock.json`) using npm >= 11.3.0: npm 10.3-11.2 prunes other-platform native bindings (rolldown/esbuild/tailwindcss/lightningcss) from the lockfile, which breaks `npm ci` on Linux CI. Any host works with npm >= 11.3.0; it records all platform variants.
- Do not import `core/` from `domain/`; do not reach into `store/`/`components/` from
  `resources/` (depcruise enforces this).

## Related repositories

- **redline-laravel** (public, `github.com/zipavlin/redline-laravel`) - Composer package
  `zipavlin/redline`; the backend (API, auth, storage, blade shells). Handoff: this
  repo's `dist/` artifacts (`redline.js`, `redline-dashboard.js`,
  `redline-dashboard.css`) are copied into redline-laravel's `public/` (committed) and
  published via `vendor:publish --tag=redline-assets`. Dev via `REDLINE_VITE_URL` in the
  host app.

## Code quality - clean-code-guard

Any session that writes or edits code in this workspace - parent or child - runs a
clean-code guard pass over its changes **before presenting, committing, or merging**.

- **Condensed checklist (always applies):**
    - Names reveal intent - no `data`, `result`, `item`, `temp`, `utils`, `handle_*`.
    - Functions ≤ 20 lines, ≤ 4 params, one thing; no boolean-flag args; no output args
      (command/query separation).
    - Comments explain *why*, never *what*; no commented-out code; match neighbor style.
    - Catch only errors you can recover from; never swallow into silent null/empty success.
    - Validate at trust boundaries (external input, request payloads); no defensive checks
      inside the boundary.
    - No speculative abstractions, config flags, or dead code (YAGNI); strip unused
      imports/symbols before delivery.
    - No hardcoded "ok"/fixture returns in production code; never weaken a test to pass.
    - Verify library APIs against the installed version before calling; read the file you
      edit and one neighbor first.
    - No new dependency where the stdlib, installed packages, or a few lines suffice.
    - Refactors preserve observable behavior; bug fixes are separate, flagged changes.
