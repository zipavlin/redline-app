# Roles

Redline has four roles: `guest`, `reporter`, `developer`, and `admin` (defined in `src/domain/role.ts`). The role comes from the JWT issued at login. The frontend derives two flags from it, and all UI gating is driven by those flags plus report ownership: `isDeveloper` is true for `developer` and `admin`; `isAdmin` is true only for `admin`.

## Role overview

| Role | Who | Key abilities |
|---|---|---|
| guest | anonymous visitor with no account | log in; create anonymous reports if the backend enables guest reporting |
| reporter | registered author | create reports, edit their own report bodies, comment if the backend enables the comments feature, change status to `progress`/`done` |
| developer | team member | everything a reporter can, plus `noticed`/`progress`/`resolved` status targets, the browser-info panel, the element-border highlight, and report pagination |
| admin | team lead | everything a developer can, plus deleting any report and managing users on the dashboard Users page |

## Guest

A guest is a visitor with no account. In the widget, guests see a single circular login button (GuestToolbar.vue) that opens the login flow; in the dashboard, guests are shown the login/registration view. See [Login](04-login.md).

If the backend enables guest (anonymous) reporting, a guest can also submit a report without signing in. The backend attributes such reports to a shared Guest user with role `guest`, and guest accounts may create reports and nothing else.

## Reporter

A reporter (or any account that is the author of a report) can create reports, edit their own report body, and - if the backend enables the comments feature - comment on reports. The author can also delete their own report.

To change a report's status, the user must be the author or a developer. What the author may actually target is limited to `progress`/`done` (see [Report statuses and who can change them](#report-statuses-and-who-can-change-them)).

## Developer

`developer` (and `admin`, which also counts as a developer) gets everything a reporter has plus developer-only tooling on the open report:

- Status targets `noticed`/`progress`/`resolved`, on top of what the author can do.
- The browser-info panel, which shows the reporter's browser and environment details.
- The element-border highlight, which outlines the annotated element on the page.
- Report pagination: jumping to the previous/next report on the page (also via Alt+Arrow keys).

Two restrictions apply: developers cannot rewrite another author's report body (editing is author-only), and they can only delete reports they authored.

## Admin

`admin` is the only role with `isAdmin`, which adds two things on top of all developer abilities:

- Delete any report, regardless of authorship.
- The dashboard Users page, which is only rendered in the sidebar for admins. There they can approve pending users (a pending account is blocked from everything until approved), change roles, create users, reset passwords, and delete users.

## Report statuses and who can change them

A report's status is one of `new`, `noticed`, `progress`, `resolved`, `done`, in that lifecycle order. Transitions must follow the lifecycle chain (`canTransitionStatus` in `src/domain/status.ts`): adjacent statuses may move in either direction, and there is one shortcut, `noticed` ↔ `resolved` (skip `progress`). No other jumps are allowed.

Which targets a user may pick is computed by `allowedStatusTargets`: developers and admins may target `noticed`/`progress`/`resolved`; the reporter (author) may target `progress`/`done`. Each set is then filtered against the lifecycle chain from the current status.

| Current status | Reporter / owner | Developer / admin |
|---|---|---|
| new | - | noticed |
| noticed | progress | progress, resolved |
| progress | - | noticed, resolved |
| resolved | progress, done | noticed, progress |
| done | - | resolved |

The status changer only appears when at least one target is available, so an author with no valid move (for example a brand-new report) sees no status control at all. Example flow: a reporter files a bug (`new`), a developer marks it `noticed` and accepts it into `progress`, the developer `resolved` it, and the reporter confirms `done` - or the developer reopens it back to `noticed`/`progress`.

## Where permissions are enforced

The widget and dashboard mirror the backend's policy to gate the UI: buttons, panels, and navigation links are shown or hidden based on the user's role flags and report ownership (for example, the sidebar Users link renders only for admins, and the browser-info button only for developers). This is presentation only.

The backend enforces the real rules: every request is authorized server-side regardless of what the UI shows. In short: the UI hides what you can't do; the API rejects what you shouldn't. The per-operation access rules are documented in [auth.md](../contracts/auth.md) (edit is author-only, delete is owner-or-admin, status updates are developer-or-owner, user management is admin-only) and status transition validation in [api.md](../contracts/api.md).
