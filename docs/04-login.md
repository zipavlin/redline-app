# Login

## Signing in

The widget opens a "Sign in" modal; the dashboard shows its own sign-in view. Both ask for an email and a password.

In the widget, the modal appears when an unauthenticated user interacts with the widget - expanding the toolbar or starting a capture - and login is enabled (`can_login` from the bootstrap payload, which fails closed to enabled). The dashboard shows the sign-in view when opened without a session.

Both apps check the existing session on load with `GET /auth/me`. The cached user is shown immediately on refresh, before the check completes, so a signed-in user never sees an unauthenticated flash.

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
