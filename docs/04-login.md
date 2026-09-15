# Login

## Signing in

The widget opens a "Sign in" modal; the dashboard shows its own sign-in view. Both ask for an email and a password.

The bootstrap payload's `capabilities.auth.login_mode` selects how the frontend obtains a redline session: `credentials` (default, fail-closed) shows the email/password form described here; `session` delegates to the host application (see below).

In the widget, the modal appears when an unauthenticated user interacts with the widget - expanding the toolbar or starting a capture - and login is enabled (`can_login` from the bootstrap payload, which fails closed to enabled). The dashboard shows the sign-in view when opened without a session.

Both apps check the existing session on load with `GET /auth/me`. The cached user is shown immediately on refresh, before the check completes, so a signed-in user never sees an unauthenticated flash.

## Host-session login (`login_mode: session`)

When the backend uses a host-session auth provider, the host application session **is** the redline identity. The frontend renders no credential form: the login modal instead points the visitor at the host application ("Sign in to the host application, then reload this page."), and the dashboard's `/register` route leaves immediately.

On load, the frontend still checks for a redline session with `GET /auth/me`. Only when that reports no session does it exchange the host session with an empty-body `POST /auth/login` (the backend ignores the body). The exchange:

- runs only over the cookie transport (same-origin); cross-origin/cloud is never eligible, since the host session cookie only exists same-origin;
- runs at most once per mount;
- is silent - a non-2xx or 202 pending-approval response or a network failure leaves the visitor unauthenticated, with no toast or error state.

Remember-me does not apply, and registration is closed. The fail-closed default remains `credentials`, so an absent or unrecognized `login_mode` keeps the normal email/password form.

## Remember me

The form includes a "Remember me" switch. When checked, the session is refreshed on page load and kept across refreshes. When unchecked, the session is not renewed on load.

## Guest mode

If the backend enables guest reporting, unauthenticated users can use the widget without signing in: capture modes start without a session and reports are submitted as a guest. The toolbar keeps a login button so a guest can sign in at any time. If guest reporting is not enabled, the widget shows just the login button, and any interaction that needs a session opens the Sign in modal instead.

## Forgot password

The "Forgot password?" link appears only when the backend has mail configured (`mailConfigured` from the bootstrap payload); otherwise the link is absent. Clicking it sends a password reset link to the email entered in the form.

The reset link points at the dashboard's `/reset-password` route with a signed query string (email, expiry, signature). Entering a new password there completes the reset.

## Pending approval

If the backend requires approval, a successful login attempt that returns a 202 response shows a pending state instead of signing the user in. The session activates only after an administrator approves the account.

## Registration links

In the widget, a "Sign up" link opens the dashboard's `/register` page in a new tab, shown only if the backend enables registration. In the dashboard, the "Don't have an account? Create one" link switches the sign-in view inline to the registration form. See [Registration](05-registration.md).

## Logging out

Log out from the widget's account menu (the gear button in the toolbar) or from the account menu in the dashboard's sidebar. On success, the session is cleared; the widget also drops every loaded report and pin and resets the unresolved count. If the server refuses the logout or the request fails, the session stays intact and an error message is shown.
