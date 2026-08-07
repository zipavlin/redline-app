# Installation

## Prerequisites

- An existing backend API provider implementing the Redline HTTP contract - see [Backend provider](08-backend-provider.md) and [the contract](../contracts/README.md). The frontend ships no server; the widget cannot work without a reachable API.
- The built frontend assets - see [Getting the assets](#getting-the-assets).
- A host page that embeds one or both custom elements.

## Getting the assets

The frontend is not published to npm (`"private": true` in `package.json`). Three build artifacts are handed to the backend provider, which serves them from its own public directory:

| Artifact                     | Contents                                                                 |
|------------------------------|--------------------------------------------------------------------------|
| `dist/redline.js`            | Widget - self-contained; the stylesheet is inlined, there is no separate widget CSS file |
| `dist/redline-dashboard.js`  | Dashboard script                                                         |
| `dist/redline-dashboard.css` | Dashboard stylesheet                                                     |

Build them from source:

```bash
npm ci
npm run build            # both bundles → dist/
npm run build:widget     # widget only
npm run build:dashboard  # dashboard only
```

The backend usually serves the copies it received - for example, the Laravel package publishes them via `vendor:publish --tag=redline-assets`.

## Embedding the widget

The widget is a Vue Custom Element registered as `<redline-widget>`:

```html
<script src="/redline.js"></script>
<redline-widget
    api="https://your-app.test/redline/api"
    dashboard="https://your-app.test/redline"
    csrf="redline_csrf"
    theme="dark"
    position="bottom-right"
></redline-widget>
```

The element can appear anywhere on the page; the script must be loaded before the element is used.

## Widget attributes

Attributes carry only transport and placement configuration. Capability flags (features, guest mode, auth provider settings, mail status) come from the backend bootstrap, and the widget shows them only if the backend enables them.

| Attribute   | Type               | Default                           | Description                                                                 |
|-------------|--------------------|-----------------------------------|-----------------------------------------------------------------------------|
| `api`       | string             | `location.origin + '/redline/api'` | API base URL                                                                |
| `dashboard` | string             | `location.origin + '/redline'`    | Dashboard base URL                                                          |
| `csrf`      | string             | `redline_csrf`                    | CSRF cookie name                                                            |
| `theme`     | `dark` \| `light`  | `dark`                            | Color scheme for the widget                                                 |
| `position`  | string             | `bottom-right`                    | Floating position: `top-left`, `top-right`, `bottom-left`, `bottom-right`   |
| `expanded`  | boolean \| string  | collapsed                         | Initial expanded state; accepts an empty string or `"true"`                 |

## Embedding the dashboard

The dashboard is a standalone SPA served as the custom element `<redline-dashboard>`:

```html
<script src="/redline-dashboard.js"></script>
<link rel="stylesheet" href="/redline-dashboard.css">
<redline-dashboard
    api="https://your-app.test/redline/api"
    dashboard="/redline"
    theme="dark"
    csrf="redline_csrf"
></redline-dashboard>
```

Unlike the widget, the dashboard keeps its own global stylesheet link and drives dark mode on its own `<html>` element.

## Dashboard attributes

Only `api`, `dashboard`, `csrf`, and `theme` are forwarded from the element; any other attribute is ignored.

| Attribute   | Default                           | Description         |
|-------------|-----------------------------------|---------------------|
| `api`       | `location.origin + '/redline/api'` | API base URL        |
| `dashboard` | `/redline`                        | Dashboard base path |
| `csrf`      | `redline_csrf`                    | CSRF cookie name    |
| `theme`     | `dark`                            | `dark` or `light`   |

## Bootstrap requirement and troubleshooting

Both apps fetch `GET {api}/bootstrap` at mount and fail closed when it is unreachable. The widget renders nothing until the bootstrap resolves - an invisible widget on a page almost always means the API base URL is wrong or the backend is unreachable. The dashboard shows a startup loader and boots only after the bootstrap resolves.

There is no constructor API (`new Redline({...})`) and no `redline:ready` handshake; configuration is attribute-only.

## Developing locally

Run `npm run dev` in this repo - the Vite dev server serves both apps as ESM on :5173. Host apps using the Laravel package set `REDLINE_VITE_URL=http://localhost` so the blade shells load the sources directly from the Vite dev server with hot reload.
