# v0.2.0 (2026-10-14)

## Added

- **Member assignment** - assign and remove members on a report, with a
  unified members control shared by the widget and dashboard.
- **@mentions** - typing `@` opens a member autocomplete in report text;
  mentioning a user offers to assign them to the report. Mention search, menu
  behavior, and chip rendering are solid.
- **Priorities** - triage reports with a priority badge and priority popover.
- **Due dates** - set and view a report's due date alongside status.
- **Host-session authentication** - the widget and dashboard support Laravel
  host-session login (`login_mode: session`) alongside cookie/bearer auth.

## Changed

- **Wire contract v2** - the frontend speaks contract version 2: member
  filter support, `has_media` replaced by `screenshot:exists` /
  `video:exists` filters, and session-login documented in the bundled
  contracts.

## Fixed

- **Sortable columns restored** - dashboard table headers sort again; sort
  keys were corrected to attributes the backend accepts (non-whitelisted keys
  surface the backend's 422 instead of failing silently).
- **Stale session verification** fixed in the widget/dashboard auth store.
- **Status workflow and member edge cases** - refined status transitions; the
  author is excluded from member lists.
- **Component polish** - priority badges/popovers, due-date popover variants,
  progress divider fix, and aria-labels on member pickers.

# v0.1.0 (2026-08-11)

Initial release.
