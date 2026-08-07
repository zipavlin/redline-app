# Redline App (frontend)

Frontend for **Redline** — a floating, on-page bug-reporting widget plus a review
dashboard for staging environments. This repository contains **only the frontend**:
two Vue 3 + TypeScript applications built with Vite 6 and Nuxt UI v4. This project isThe Laravel
API backend agnostic, but Laravel package is prepared and lives in the sibling **redline-laravel** repository.

The npm package is **`redline-app`** with `"private": true` — it is **not published to
npm**. Build artifacts are handed off to the backend repo instead (see "Build &
handoff").

---

## What's in here

| | Widget | Dashboard |
|---|---|---|
| Entry | `src/widget.ts` | `src/dashboard.ts` |
| Custom element | `<redline-widget>` | `<redline-dashboard>` |
| Rendering | Shadow DOM (isolated, no style bleed) | Standalone SPA (own `<html>`, global stylesheet) |
| Router | none | `vue-router` (`createWebHistory`) |
| Hosted at | injected into host pages | `/{redline.path}` (default `/redline`) |
| Bundle | `dist/redline.js` (CSS inlined) | `dist/redline-dashboard.js` + `dist/redline-dashboard.css` |

---

## Requirements

- **Node 20+** (Vite 6 requirement)
- npm (`package-lock.json` is committed — use `npm ci`)

---

## Quick start

```bash
npm ci
npm run dev
```

Starts the Vite dev server on **:5173**, serving **both** the widget and the dashboard as
ESM from one process.

### Developing against a Laravel host

1. Run `npm run dev` in this repo.
2. In the host app (with `zipavlin/redline` installed), set:

   ```env
   REDLINE_VITE_URL=http://localhost
   ```

3. The package's blade shells (`widget.blade.php`, `dashboard.blade.php`) then load
   `src/widget.ts` / `src/dashboard.ts` (and `css/redline-dashboard.css`) directly from
   the Vite dev server with hot reload.

---

## Build & handoff

```bash
npm run build            # widget, then dashboard (IIFE) → dist/
npm run build:widget     # REDLINE_TARGET=widget only
npm run build:dashboard  # REDLINE_TARGET=dashboard only
```

Each pass produces one IIFE bundle (`vite.config.ts` uses lib+IIFE, one entry per pass;
`outDir: 'dist'`, `emptyOutDir: false`).

`dist/` artifacts:

- `dist/redline.js` — the widget. **Self-contained**: its Tailwind/Nuxt UI CSS is
  compiled in via `css/redline.css?inline` and injected into the shadow root, so there is
  **no separate widget CSS file**.
- `dist/redline-dashboard.js` + `dist/redline-dashboard.css` — the dashboard SPA.

**Handoff:** copies of these three files are committed into `redline-laravel/public/`
(which publishes them via `vendor:publish --tag=redline-assets`). When you change the
frontend, rebuild and update the copies in the backend repo.

---

## Architecture

### Two apps, one config

- **Widget** — a Vue Custom Element rendered into a **Shadow DOM**: fully isolated from
  the host page (no Tailwind prefix, no style bleed either way). No router. Capability
  flags (features, guest mode, auth provider settings, mail status) are fetched at mount
  from the public `GET /{path}/api/bootstrap` and **fail closed** if unreachable. Element
  attributes carry only transport/placement config (`api`/`dashboard`/`csrf`/`theme`,
  plus optional `position`/`expanded`). No constructor API and no ready handshake.
- **Dashboard** — a standalone Vue SPA mounted as the native custom element
  `<redline-dashboard>`, with `vue-router` (`createWebHistory` on the `dashboard` base
  path) and its own global stylesheet link. Routes: `/` (home), `/reports`,
  `/users`, `/reset-password`. Dark mode is driven by `store.settings.theme` and toggled
  on its own `<html>` element (Nuxt UI `colorMode: false`).

### API & bootstrap

- `src/core/api/client.ts` — transport-agnostic API client.
  - `CookieTransport` — same-origin auth: HttpOnly `redline_token` cookie (JS never
    reads it) + double-submit CSRF: the non-HttpOnly `redline_csrf` cookie is echoed as
    the `X-Redline-CSRF` header on non-GET requests. Names are updated from bootstrap.
  - `BearerTransport` — cross-origin/cloud auth: `Authorization: Bearer` token from
    sessionStorage `redline_cloud_token`; no cookies.
- `src/core/bootstrap.ts` — fetches `/api/bootstrap` at mount and folds the payload onto
  the runtime config (never throws).

### Data layer

- Per-resource folders in `src/resources/` (`auth`, `report`, `comment`, `screenshot`,
  `user`, `video`): model types, api calls, query/mutation composables and cache keys
  live together.
- Active report/comment data: **Pinia stores** (`src/store/`). Lists, aggregates and
  comments: **TanStack Query**.
- Aggregate numbers come **only** from the generic `/aggregate` endpoint — no dedicated
  overview endpoints.

### Layering (enforced)

`npm run lint:boundaries` (dependency-cruiser, `.dependency-cruiser.cjs`) enforces
downward-only dependencies:

```
domain/      ← leaf (pure logic)
core/        → domain/
resources/   → core/, domain/, composables/
store/       → resources/, domain/, core/, composables/
components/  → everything
```

`composables/` is importable by `resources/`, `store/` and `components/`. Do not add a
new top-level layer without updating the cruise config.

---

## Testing, type-checking, linting

```bash
npm run test              # vitest run — happy-dom
npm run test:watch        # watch mode
npm run type-check        # vue-tsc --noEmit
npm run lint:boundaries   # dependency-cruiser layering
```

- **25 test files** under `tests/` (~182 tests at extraction time). Tests are **not**
  co-located under `src/`; `vitest` includes only `tests/**/*.test.{js,ts}`.
- `type-check` is **clean** in this extraction.
- Combined gate: `npm run type-check && npm run test && npm run lint:boundaries`.

---

## Vite gotchas (read before adding dependencies)

- **TipTap/ProseMirror must be dedup'd.** `vite.config.ts` lists ~15 ProseMirror packages
  in **both** `resolve.dedupe` and `optimizeDeps.include`. Two copies of
  `prosemirror-state` each start their plugin-key counter at `"plugin$"`, which throws
  `"Adding different instances of a keyed plugin"` when combined in one editor. Any new
  PM/TipTap dependency must be added to **both lists**.
- **`colorMode: false`** in the Nuxt UI plugin — apps drive dark mode from the store, so
  Nuxt UI's `useDark` (`.dark` on `<html>`) is disabled.
- **`router: isDashboard || mode === 'development'`** — dev always enables Nuxt UI's
  router override so the dashboard nav uses vue-router links while both entries are
  served from one config (the widget's only `U*` `to` usages are external `target="_blank"`
  links, which take the plain-anchor branch).
- `auto-imports.d.ts` and `components.d.ts` are generated by `@nuxt/ui/vite` and
  **gitignored** — they regenerate on first dev/build.
- `server.watch.ignored` excludes `docs/`, `node_modules/`, `tests/`, `dist/`.

---

## Conventions

- Alias `@` → `src/`.
- EditorConfig: LF line endings, 4-space indent, UTF-8.
- Commit `package-lock.json`; install with `npm ci`.
- Keep `domain/` free of DOM/I/O; keep `core/` free of app state.
- Visual/UX intent lives in [BRANDGUIDE.md](BRANDGUIDE.md); the actual color theme is
  `ui.colors` in `vite.config.ts` (primary `rose`, secondary `purple`, neutral `slate`,
  …).

---

## Contracts

`contracts/` is currently an **empty directory**. Per the parent workspace
(`redline-project/manifest.yaml`), the API contract source is pointed at
`redline-app/contracts` (version "1"), but the contract ownership model is **still being
established** — no contract documents exist yet. Do not assume the directory contains
anything.

---

## Related repositories

- **redline-laravel** (public) — the Laravel backend (API, auth, storage, blade shells);
  consumes this repo's built artifacts.

---

## License

MIT. See [LICENSE.md](LICENSE.md).
