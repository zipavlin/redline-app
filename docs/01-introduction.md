# Introduction

## What is Redline

Redline is a bug-reporting tool for staging and hosted applications. It ships as a single private npm package, `redline-app`, that contains two frontend applications: a floating widget end users use to pin and describe problems on a page, and a standalone dashboard where maintainers review and manage those reports. Redline is backend-agnostic - it only renders and talks to an API; a backend must provide that API for anything to work. See [Backend provider](08-backend-provider.md) for what the API must look like.

## The widget

The widget (`src/widget.ts`) is a Vue custom element registered as `<redline-widget>`. It renders in a Shadow DOM, so it is fully isolated from the host page: no style bleed in either direction. It appears as a floating toolbar that lets users pin a location on the page and attach a description and, if the backend enables it, a screenshot annotation or a screen recording. Created reports appear as pins on the page and can be opened, moved, and discussed in place.

The widget is configured only through element attributes (`api`, `dashboard`, `csrf`, `theme`, `position`, `expanded`). Everything else - which capabilities are available (screenshots, videos, comments, guest mode, registration, mail) - is fetched at mount from the backend's public bootstrap endpoint and fails closed: if the endpoint is unreachable, the widget starts with those capabilities disabled.

## The dashboard

The dashboard (`src/dashboard.ts`) is a standalone Vue SPA served under `/{redline.path}` (default `/redline`), embedded as the native custom element `<redline-dashboard>`. It has three main pages:

- **Home** - an overview landing page.
- **Reports** - review, filter, and manage all reports.
- **Users** - manage user accounts; only visible to admins.

Like the widget, the dashboard reads its capability flags from the backend bootstrap payload at mount and only enables features (registration, role selection, mail-driven flows) if the backend enables them.

## Roles at a glance

A user is one of four roles: guest, reporter, developer, or admin (see `src/domain/role.ts`). The role determines what a user can do - for example, which statuses a user may move a report to. Roles are a backend concept; the frontend only displays and enforces what the backend reports. Guests are unauthenticated users who can, if the backend enables guest mode, file reports. See [Roles](03-roles.md).

## How a report flows

A report starts when a user pins a location on a page and writes a description (basic report), optionally adding an annotated screenshot or a video recording if the backend enables those. The report is submitted to the backend and appears in the dashboard, where maintainers review it and discuss it through comments if the backend enables comments. The report then moves through the lifecycle statuses - `new`, `noticed`, `progress`, `resolved`, `done` (see `src/domain/status.ts`) - until it is resolved and done. Maintainers can reopen a report at any point after it is closed.

## Terminology

- **Widget** - the floating, Shadow-DOM-isolated toolbar embedded in a host page for filing reports.
- **Dashboard** - the standalone SPA where reports and users are reviewed and managed.
- **Report** - a single bug or issue record: a description pinned to a page, optionally with a screenshot or video.
- **Pin** - the marker on a page marking where a report refers to; every report is anchored to one.
- **Basic report** - a report with a description pinned to a location, with no screenshot or video.
- **Annotated report** - a report that includes a screenshot with drawn annotations.
- **Video report** - a report that includes a screen recording.
- **Status** - the report's stage in its lifecycle: `new`, `noticed`, `progress`, `resolved`, or `done`.
- **Page URL (location)** - the URL of the host page a report was pinned on; reports are grouped and filtered by it.

## Documentation map

- [Installation](02-installation.md) - installing and embedding the widget and dashboard.
- [Roles](03-roles.md) - what each role can do.
- [Login](04-login.md) - signing in.
- [Registration](05-registration.md) - creating an account.
- [Using the widget](06-using-the-widget.md) - filing, annotating, recording, and reviewing reports from the page.
- [Using the dashboard](07-using-the-dashboard.md) - managing reports and users.
- [Backend provider](08-backend-provider.md) - the API a backend must implement.
- [API contract](../contracts/README.md) - the consumer-side contract for backends.
