import { ApiResponseError, isUnauthenticatedBody } from '@/core/api/errors'

/**
 * A 403 on the member-candidates query is the member-policy denial only when
 * the body is a plain forbidden response. Under contract v3 an auth-denied 403
 * carries the `unauthenticated` marker - a dead session, not a permission
 * problem - and must NOT hide the member filter. The cached-user gate that
 * normally keeps this list developer-only holds only at mount: mid-session
 * expiry leaves `auth.user` populated.
 *
 * The list query throws `ApiResponseError`, which carries the status and the
 * raw response body; any other error shape means no denial was observed.
 */
export function isMemberFilterDenied(error: unknown): boolean {
    return error instanceof ApiResponseError
        && error.status === 403
        && !isUnauthenticatedBody(error.data)
}