/**
 * Shared API error parsing - normalizes Laravel validation error payloads into
 * a single { fieldErrors, summary } result for the auth components.
 *
 * Laravel validation failures arrive as `{ errors: { field: [...] } }` (422s
 * are keyed by default; login always was). Register used to return a
 * flat/array_values shape and can still come back as a flat or deeply nested
 * string array. This parser handles all three shapes defensively and never
 * throws on unexpected payloads.
 */

export interface ApiFieldErrors {
    [field: string]: string[]
}

export interface ParsedApiErrors {
    fieldErrors: ApiFieldErrors
    summary: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deeply flatten an arbitrary value and keep only the string leaves (the
 * legacy register shape nests arrays: `[["The name..."], ["The email..."]]`).
 */
function collectStrings(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) {
        for (const item of value) collectStrings(item, out)
    } else if (typeof value === 'string') {
        out.push(value)
    }
    return out
}

export function parseApiErrors(data: unknown): ParsedApiErrors {
    // Not an object (or null/array) - nothing to extract.
    if (!isRecord(data)) {
        return { fieldErrors: {}, summary: null }
    }

    const errors = data.errors

    // No `errors` key - fall back to a top-level `message` string.
    if (errors === undefined || errors === null) {
        return typeof data.message === 'string'
            ? { fieldErrors: {}, summary: data.message }
            : { fieldErrors: {}, summary: null }
    }

    // Flat or deeply nested string array → joined summary.
    if (Array.isArray(errors)) {
        return { fieldErrors: {}, summary: collectStrings(errors).join(' ') || null }
    }

    /**
     * Field-keyed object → per-field string arrays; the summary stays null so
     * errors render under their fields instead.
     */
    if (isRecord(errors)) {
        const fieldErrors: ApiFieldErrors = {}
        for (const [field, value] of Object.entries(errors)) {
            /**
             * Scalar values are coerced only when truthy - `String(null)` → "null"
             * and `String(undefined)` → "undefined" would otherwise surface as fake
             * validation messages. Fields with no message are dropped entirely so
             * consumers resolve them to `false`/no error via `?.join(' ') || false`.
             */
            const messages = Array.isArray(value)
                ? value.filter((item): item is string => typeof item === 'string')
                : value
                    ? [String(value)]
                    : []
            if (messages.length > 0) {
                fieldErrors[field] = messages
            }
        }
        return { fieldErrors, summary: null }
    }

    /**
     * `errors` present but of an unexpected type (string, number…) - keep it
     * defensive, never throw.
     */
    return { fieldErrors: {}, summary: null }
}

/**
 * Carries the HTTP status and (optionally) the response body alongside the message so
 * query retry logic and UI can discriminate auth denies (never retried) from retryable
 * failures and react to the response body (e.g. the auth-denial marker) without re-fetching.
 */
export class ApiResponseError extends Error {
    readonly status: number
    readonly data?: unknown

    constructor(message: string, status: number, data?: unknown) {
        super(message)
        this.name = 'ApiResponseError'
        this.status = status
        this.data = data
    }
}

/**
 * Auth-deny statuses are never retried: a retry cannot fix them. A 403 is an
 * auth denial (dead session or a permission refusal) that would repeat
 * identically, and a 419 is an expired CSRF token that only a fresh page
 * load can renew.
 */
const AUTH_DENIAL_STATUSES = new Set([403, 419])

export function isAuthDenialStatus(status: number): boolean {
    return AUTH_DENIAL_STATUSES.has(status)
}

/**
 * The stable auth-deny discriminator under contract v3: every auth-denied
 * response is a 403 whose body carries this `error` field. Plain 403s
 * (member-policy denial, feature disabled, forbidden origin) carry no `error`
 * field, so only the body - never the status code alone - can tell a dead
 * session from a permission denial.
 */
export const UNAUTHENTICATED_MARKER = 'unauthenticated'

/** True when the body is a non-null object whose `error` is the v3 marker. */
export function isUnauthenticatedBody(data: unknown): boolean {
    return isRecord(data) && data.error === UNAUTHENTICATED_MARKER
}

/**
 * Duck-typed so plain Error with no status falls through and any error shape
 * carrying a matching numeric status (ApiResponseError included) is caught.
 */
export function isAuthDenialError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    const status = (error as { status?: unknown }).status
    return typeof status === 'number' && isAuthDenialStatus(status)
}
