# Backend provider

Redline has no backend inside this package. `redline-app` is frontend-only and backend-agnostic: the widget and dashboard speak the Redline HTTP API and work with any backend that implements it. The package cannot run standalone - a backend must serve the API and host the built `dist/` assets.

## Existing

The one verified implementation is the **redline-laravel** package (Composer `zipavlin/redline`): <https://github.com/zipavlin/redline-laravel>. It is the reference implementation the consumer contract in `../contracts/` was extracted from and verified against.

## Writing your own

Any backend can integrate by implementing the consumer contract - start at `../contracts/README.md`, then:

- `../contracts/api.md` - complete endpoint reference (method, path, auth, body, response, errors)
- `../contracts/auth.md` - authentication and CSRF
- `../contracts/bootstrap.md` - the bootstrap payload
- `../contracts/query-grammar.md` - the `filter[]` / `include[]` / `sort[]` / `paginate[]` / `aggregate[]` / `group_by[]` grammar
- `../contracts/errors.md` - error envelopes and status codes

At minimum the backend must serve `GET /{api}/bootstrap` - the frontend fails closed (empty features, no registration) when it is unreachable - and return the contract `version` integer. Auth is either same-origin cookie mode (HttpOnly `redline_token` cookie plus `X-Redline-CSRF` double-submit header on state changes) or cross-origin Bearer mode (`Authorization: Bearer` with the token from `sessionStorage.redline_cloud_token`); details in `../contracts/auth.md`.

## Contributing

This repo is frontend only; backend work happens in [redline-laravel](https://github.com/zipavlin/redline-laravel). PRs are welcome on either. Verify changes with `npm ci`, `npm run build`, `npm run type-check`, `npm run test`, `npm run lint:boundaries`. Contract updates must be re-extracted from code, never invented - see "How to update this contract" in `../contracts/README.md`.
