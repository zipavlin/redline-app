# Registration

## When registration is available

Registration is only offered when the backend enables it: the public bootstrap payload carries `can_register`, and the frontend fails closed to disabled. If the backend is unreachable, no registration entry point appears. Both the widget and the dashboard gate their sign-up links on this flag.

## Signing up

The registration form always asks for a full name, an email address, and a password. The password field has a show/hide toggle, a button that generates a random password, and a live strength meter with four segments. If the backend defines extra fields, they are rendered below the basic fields (see [Extra provider fields](#extra-provider-fields)).

## Choosing a role

Role selection appears only when the backend enables it (`can_select_role`). Public registration offers Reporter and Developer only; Admin is never offered publicly, and the backend silently downgrades it anyway. If role selection is disabled, new accounts get the default role. See [Roles](03-roles.md) for what each role can do.

## Extra provider fields

The backend can declare additional registration fields in the bootstrap payload (`capabilities.auth.fields`), each with a name, a type, and a label. The form then renders each declared field below the standard ones; supported input types include text, password, number, and pin.

## After you submit

On success the user is signed in immediately and taken into the app. Two backend settings can delay that:

- If the backend requires email verification, an unverified account cannot sign in until the verification link sent to the email address has been followed.
- If the backend requires approval, the account stays pending until an admin approves it.

A pending submission is answered with HTTP 202: the form stays open with an explanatory message, and the user is not signed in until the pending state is resolved.

## Where to register

Widget users are sent to the dashboard's `/register` page, which opens in a new tab. Dashboard users register inline: the [login](04-login.md) view switches to the registration form in place, and `/register` is also a direct route. Both paths are shown only when registration is enabled.
