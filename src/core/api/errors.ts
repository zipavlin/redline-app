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
