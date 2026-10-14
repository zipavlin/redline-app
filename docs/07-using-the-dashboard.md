# Using the dashboard

The dashboard is a standalone application where reports are reviewed and managed, and where admins manage users. It is served by the backend at `/{redline.path}` (default `/redline`) and opens in its own tab.

## Opening the dashboard

The widget's account menu (the gear button in the toolbar) has a **Dashboard** entry that opens the dashboard in a new tab, at the URL given by the widget's `dashboard` attribute (defaults to the same origin plus `/redline`). You can also navigate to `/{redline.path}` directly.

Dark mode follows the `theme` config: the dashboard applies it to its own document, and you can switch between light and dark from the theme toggle in the sidebar's account menu.

Navigation is a collapsible sidebar on the left:

- **Home** - the overview landing page.
- **Reports** - the report review list.
- **Users** - user management. Only visible to admins.

A search button at the top of the sidebar opens the command palette (keyboard shortcut Cmd+K). It can jump to any page and apply report views directly: All reports, Unresolved reports, Resolved reports, and My reports. The account menu at the bottom of the sidebar shows the signed-in user, a theme toggle, and **Log out**.

## Home

The Home page is the landing page and shows five cards, refreshed automatically every 60 seconds:

- **Overview** - a donut chart of reports by status, with a refresh button whose tooltip shows when the data was last updated.
- **Reporters** - the top 3 reporters by number of reports.
- **Locations** - the top 5 pages by number of reports, with counts and bars.
- **Reports** - the 5 most recent reports (status badge, title, page, relative time). Clicking a row (or pressing Enter while focused) opens the report details drawer.
- **Users** (admins only) - total, active, and pending user counters. When users are pending approval, the card lists them and offers a **View pending approvals** button that jumps to the Users page filtered to pending users.

## Reports

The Reports page lists all reports for the application, with tabs, search, filters, and a details drawer.

### Tabs and counts

Three tabs at the top of the page, each with a live count:

| Tab | Shows |
| --- | --- |
| All | Every report |
| Unresolved | Reports that are not resolved or done |
| Resolved | Reports that are resolved or done |

### Searching and filtering

A search box next to the tabs filters by report title. The **Filter** popover offers the advanced filters:

| Filter | Effect |
| --- | --- |
| Only mine | Only reports you filed |
| Has media | Only reports with a screenshot or video |
| Has comments | Only reports with comments |
| Reported by | Only reports by a chosen author |
| Page URL | Only reports from a chosen page |
| Date range | Only reports created in the range |

Active filters are shown as removable tags above the table; each tag's × clears just that filter, and a **Clear all** link resets every filter at once.

### Columns and sorting

The table has these columns:

| Column | Notes |
| --- | --- |
| Status | Badge with the report status |
| Priority | Badge with the report priority |
| Due at | Deadline badge; hover for the full date and time |
| Report | The report title |
| Path/URL | The page the report was filed on |
| Author | The author's name |
| Created at | Relative time; hover for the full date and time |

Click a column header to sort by it (Status, Priority, Due at, Path/URL, and Created at are sortable; the Report and Author columns are not). Clicking again reverses the direction. The header row stays visible while scrolling, a settings icon opens the column visibility menu, and the footer shows the total report count with pagination. When nothing matches the current tabs, search, and filters, the table shows an empty state.

The table supports keyboard navigation: once the table has focus, the Up and Down arrow keys move the selection, opening the report details drawer for the highlighted row (inbox style). At the top or bottom of a page the selection carries over to the previous or next page; Escape clears the selection and closes the drawer.

### Report details

Clicking a row opens the details drawer, which shows:

- The author's name and email and a status badge.
- The report body. The author can edit it in place (pencil menu); the author or an admin can delete the report.
- A status action, offered according to your role per [Roles](03-roles.md): developers and admins can set noticed, progress, or resolved; reporters (including the author) can set progress or done.
- Comments, if the backend enables them.
- Browser information, visible to developers.
- A screenshot or video panel, when the report has one.
- An **Open report on page** action (see below).

### Opening reports on the page

Every row has an **Open on page** button (external-link icon) that opens the report's page URL with a `?redline-report=<id>` query parameter in a new tab. When a Redline widget is embedded on that page, it picks up the parameter, scrolls to the report's pin, and opens the report - see [Deep links](06-using-the-widget.md#deep-links). The same action is available from the details drawer.

## Users (admin only)

The Users page is only visible to admins. It lists user accounts with tabs, search, and a role filter.

### Finding users

Three tabs at the top, each with a count: All, Active, and Pending. The counts honor the current search and role filter. A search box filters by name or email (press Enter or the send button to commit), and the **Filter** popover narrows by role: Any role, Admin, Developer, or Reporter. An active role filter appears as a removable tag above the table.

The table has these columns:

| Column | Notes |
| --- | --- |
| Status | Active or Pending badge |
| Full name | The user's name |
| Email | The user's email |
| Role | Admin, Developer, or Reporter badge |
| Reports | Number of reports filed |
| Comments | Number of comments posted |
| Created at | Relative time; hover for the full date and time |

Sorting, column visibility, sticky headers, pagination, and keyboard navigation work the same as on the Reports table (sortable columns are Full name, Reports, Comments, and Created at; Status, Email, and Role are static).

### User details

Clicking a row opens the details drawer, which shows the user's stats (total, open, and done reports) and an edit form:

- **Status** - Active or Pending. You cannot change the status of your own account.
- **Role** - Admin, Developer, or Reporter. You cannot change the role of your own account.
- **Name** and **Email**.
- **Password** - optional; leave blank to keep the current password. A dice button generates a random password.

The actions at the bottom are **Delete user** (not available for your own account) and **Save**. For a pending user, the save menu additionally offers **Approve & Save**, which sets the status to Active. Pending users must be approved before they can sign in.

### Creating users

The **New user** button opens a modal asking for name, email, role (Reporter, Developer, or Admin), and a password. The password behavior depends on the backend's mail configuration:

- If the backend has mail configured, the password is optional - leaving it blank emails the new user a set-password invitation instead.
- If mail is not configured, the password is required.

New users are created in the pending state and must be approved (see above) before they can sign in.
