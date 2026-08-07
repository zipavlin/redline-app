# Using the widget

The widget is the floating bug-reporting toolbar that host pages embed as `<redline-widget>`. It lets visitors file basic, annotated, and video reports on the page they are viewing and review reports filed by others.

## The toolbar

The toolbar appears as a floating round button - the Redline logo - pinned to one of the four corners of the screen (bottom-right by default). Clicking the logo expands it into a vertical stack of action buttons; clicking the logo again collapses the stack.

- When collapsed, the logo carries a badge with the number of unresolved reports on the current page. The badge is hidden when there are none.
- Expanding the toolbar loads the reports for the current page; collapsing it removes the pins again.
- The action stack contains:
  - Pin a comment - always available.
  - Annotate - only shown if the backend enables screenshots.
  - Record video - only shown if the backend enables videos and the browser supports screen capture.
  - The filter toggle (see [Filtering](#filtering)).
  - The account/settings menu (see [Settings](#settings)).
- A signed-out visitor sees a single round login button instead of the action stack; clicking it starts the sign-in flow, or the guest session flow if the backend enables guest mode (see [Login](04-login.md)).

## Creating basic reports

Pin reports capture a comment at a specific spot on the page.

1. Expand the toolbar and click Pin a comment (the comment icon), or press Alt+C.
2. Click anywhere on the page to drop the pin. Clicking an element pins the report to that element; clicking empty space pins it to the page coordinates.
3. The composer opens next to the pin. Write the report body in the rich-text editor - formatting, lists, and commands are available from the "/" menu.
4. Optionally attach a screenshot: click the camera button to capture the page, or the pinned element if you pinned one; you can also paste an image from the clipboard directly into the editor. The screenshot controls are only shown if the backend enables the screenshots feature; pinning itself is always available.
5. Click Submit. Submit stays disabled until the body has content.

The report is saved with its pin location and element, and the screenshot (if any) is attached as part of the report.

## Creating annotated reports

Annotated reports combine a drawn screenshot with a description.

1. Click Annotate, or press Alt+S. The button is only shown if the backend enables screenshots.
2. Draw on the full-page overlay. The toolbar offers Select, Erase, Freehand, Highlighter, Arrow, Line, Text, Rectangle, and Circle tools, a color picker, undo, and a scroll lock. The lock freezes the page while you draw - it is shared across the whole three-step session and survives the toolbar unmounting between steps - and it decides how much of the page ends up in the capture (see step 3). The toolbar itself mirrors the widget's corner: it docks to the same vertical edge as the main toolbar, and the overlay it drives is a full-page SVG drawing surface rendered directly on the page, so annotations stay crisp at any zoom and are burned into the screenshot only when you finish.

   While drawing, you can use the keyboard instead of the toolbar:

   | Key | Effect |
   |---|---|
   | `Ctrl`/`Cmd` + `Z` | Undo the last stroke |
   | `Delete` / `Backspace` | With the **Select** tool active, delete the selected annotation |
   | `Escape` | With a drawing tool active, switch back to **Select**; with nothing drawn, exit annotation mode |

3. **Crop the capture.** Click **Save** on the toolbar. The widget hides all of its own chrome (the annotation toolbar and the main toolbar) so nothing Redline-owned lands in the shot, captures the page, and - if the scroll lock is on - pre-crops the image to the visible viewport at your current scroll position. This opens **Step 2 of 3 - Crop screenshot**:
   1. The capture is shown at natural size in a scrollable preview, with a white-bordered rectangle as the initial crop (the visible viewport if the scroll lock was off, the full page if it was on).
   2. Drag the rectangle's outline to move it; drag the white corner/edge handles to resize it (10 px minimum).
   3. **Back** returns to the annotation step with your drawing intact; **Continue** accepts the crop.

   If the capture itself fails, you get a "Capture failed - please try again" toast and land back on the annotation step.

4. **Describe the issue.** **Step 3 of 3** shows a thumbnail of the cropped screenshot next to a rich-text editor with the placeholder "Describe what you drew …".
   1. Type your description (a body is required; formatting toolbar and `/`-menu work as in basic reports).
   2. **Submit** creates the report with the screenshot attached and a pin placed at the center of the cropped region. If the body is somehow empty it is stored as `(screenshot)`.
   3. On success you get a "Report submitted" toast and the report appears as a pin on the page; on failure, "Submit failed - please try again" and you can retry.

   Closing the modal at any step (the **X**, or `Escape`) asks "Discard report - All progress will be lost." before giving up.

## Creating video reports

Screen recording captures a short clip of the tab (WebM/MP4) and submits it with the report. The **Record video** button only appears if the backend enables the `videos` feature and the page is in a secure context - screen capture needs `getDisplayMedia`, which browsers only allow over HTTPS.

The flow is record → review → describe:

1. **Record.** Click **Record video** (or press `Alt`+`V`). The browser shows its screen-capture prompt - pick the tab, window, or screen. A floating bar appears (mirroring the widget's corner) with:
   - a pulsing record icon and the elapsed time (the timer turns warning-colored at 1:45 as a courtesy heads-up),
   - **Pause** / **Resume** (also toggled with `Space`, unless you're typing in a field),
   - **Exit** (asks to confirm only if you've recorded something) and **Save**.
2. **Review.** **Save** stops the capture and opens **Step 2 of 3 - Review recording**, a modal with a playable video. **Retake** discards the clip (after a confirm) and reopens the browser prompt; **Continue** moves on.
3. **Describe.** **Step 3 of 3** is the same describe step as for annotations, with the placeholder "Describe what you recorded …". Submitting attaches the video and a pin at the center of the current viewport; an empty body is stored as `(video)`.

Notes: denying the browser prompt simply exits the flow without an error - nothing was recorded. In a non-secure context you get "Screen capture requires HTTPS". The backend accepts one video per report, up to 50 MB.

## Opening reports

Every report listed on the current page shows as a pin marker, color-coded by status (primary for `new`/`noticed`, warning for `progress`, success for `resolved`). Click a pin - or use a deep link - and the report opens in a popover anchored to that pin. The popover is non-modal and opens toward the side of the annotated element that covers the least page space, so it stays on screen.

The popover shows:

| Element | Notes |
|---|---|
| Header | Author avatar + name, relative time (tooltip shows the exact timestamp), options menu (⋮), close |
| Options menu | **Edit** - author only; **Delete** - author or admin (with a confirm modal). Mirrors the backend policy exactly |
| Status badge | Colored by status |
| Body | Rendered rich text; **Edit** (author only) swaps it for an inline editor - the popover is locked against dismissal while editing so a draft can't be lost, and `Escape` cancels the edit before it closes anything |
| Status changer | Author or developer+ can move the report through the lifecycle; marking it **Resolved** shows a toast and closes the popover |
| Element border | Developer-only - outlines the annotated element on the page so you can see exactly what was flagged |
| Browser info | Developer-only - the reporter's user-agent details |
| Screenshot / Video | Opens the attachment in a sub-panel, when the report has one |
| Pagination | Developer-only, when more than one report is listed - walks the pins in on-page order ("n / m") |
| Comments | Only if the backend enables the `comments` feature; a warning chip on the button shows the count |

## Filtering

The widget only ever lists reports for the current page - the list query always sends `filter[location]` scoped to the page URL, and reports are grouped per page (see [Deep links](#deep-links)). Within that page you can narrow the list two ways:

- **Quick toggle** - the eye button on the toolbar flips between **Show all** and **Unresolved only**.
- **Settings → Filter** - the full choice, from the settings menu (`Alt`+`M`):

| Filter | Meaning |
|---|---|
| Show all | Every report on this page |
| Unresolved only | Every open status (`new`, `noticed`, `progress`) |
| New only | Just `new` reports |
| Mine only | Reports where you are the author |

The filter is reflected in the URL (`?redline-filter=…`), so it survives reloads and can be shared.

## Settings

The gear button (`Alt`+`M`) opens the account popover with the current user's name and role, then:

| Item | Notes |
|---|---|
| Dashboard | Opens the dashboard in a new tab |
| Position | The toolbar's corner: top-left, top-right, bottom-left, bottom-right (defaults to the `position` attribute, `bottom-right`) |
| Appearance | Light or Dark - the widget's theme lives in its own shadow DOM and never touches the host page (defaults to the `theme` attribute, `dark`) |
| Filter | The filter submenu described above |
| Log out | Ends the session and drops every pin from the page; if the server refuses, your session stays intact and you get a "Could not log out" toast |

## Deep links

The widget keeps two query parameters in sync with the URL via `history.replaceState` (no page reload), so reports and filters survive refresh and can be linked to:

- `?redline-report=<uuid>` - opens that report. If it's already in the on-page list it's focused; otherwise it's fetched, added, and the page scrolls smoothly to center the pin before the popover opens.
- `?redline-filter=<key>` - applies a filter (`all`, `unresolved`, `mine`, or any concrete status like `new`).

Both are honored on session start. Redline's own parameters are stripped from the URL that's stored with the report and from the page-grouping key, so opening a report never fragments the page into different groups - and tracking params (`utm_*`, `gclid`, …) are dropped too, so campaign links don't split pages either.

## Keyboard shortcuts

| Shortcut | Scope | Action |
|---|---|---|
| `Alt` + `C` | Anywhere | Start / cancel a pinned comment |
| `Alt` + `S` | Anywhere, if the backend enables `screenshots` | Start / cancel an annotated screenshot |
| `Alt` + `V` | Anywhere, if the backend enables `videos` and the context is secure | Start / cancel a video recording |
| `Alt` + `M` | Anywhere | Open / close the settings menu |
| `Escape` | Context-dependent | Drops a pending pin; exits pin/annotation/video mode (with a confirm when there's progress); closes the settings menu or an open report |
| `Ctrl`/`Cmd` + `Z` | Annotation step | Undo the last stroke |
| `Delete` / `Backspace` | Annotation step, Select tool | Delete the selected annotation |
| `Space` | Recording | Pause / resume |
| `Alt` + `←` / `Alt` + `→` | Open report, developer only | Previous / next report on the page |
