import { describe, expect, it } from 'vitest'
import { ApiResponseError, isAuthDenialError, isAuthDenialStatus, parseApiErrors } from '@/core/api/errors'

describe('parseApiErrors', () => {
    it('keyed object errors → fieldErrors populated, summary null', () => {
        const parsed = parseApiErrors({
            message: 'The given data was invalid.',
            errors: {
                email: ['The email field is required.'],
                password: ['The password field is required.'],
            },
        })

        expect(parsed.fieldErrors.email).toEqual(['The email field is required.'])
        expect(parsed.fieldErrors.password).toEqual(['The password field is required.'])
        expect(parsed.summary).toBeNull()
    })

    it('scalar message value → coerced to a single-element string array', () => {
        const parsed = parseApiErrors({
            errors: { email: 'The email field is required.' },
        })

        expect(parsed.fieldErrors.email).toEqual(['The email field is required.'])
        expect(parsed.summary).toBeNull()
    })

    it('flat string array → summary joined with spaces', () => {
        const parsed = parseApiErrors({
            errors: ['Invalid credentials.', 'Try again.'],
        })

        expect(parsed.summary).toBe('Invalid credentials. Try again.')
        expect(parsed.fieldErrors).toEqual({})
    })

    it('nested array (legacy register shape) → flattened into the summary', () => {
        const parsed = parseApiErrors({
            errors: [['The name field is required.'], ['The email field is required.']],
        })

        expect(parsed.summary).toBe('The name field is required. The email field is required.')
        expect(parsed.fieldErrors).toEqual({})
    })

    it('missing errors + message string fallback → summary is the message', () => {
        const parsed = parseApiErrors({ message: 'These credentials do not match our records.' })

        expect(parsed.summary).toBe('These credentials do not match our records.')
        expect(parsed.fieldErrors).toEqual({})
    })

    it('empty or absent data → summary null, fieldErrors empty', () => {
        expect(parseApiErrors(undefined)).toEqual({ fieldErrors: {}, summary: null })
        expect(parseApiErrors(null)).toEqual({ fieldErrors: {}, summary: null })
        expect(parseApiErrors({})).toEqual({ fieldErrors: {}, summary: null })
        expect(parseApiErrors({ message: 42 })).toEqual({ fieldErrors: {}, summary: null })
    })

    it('mixed array drops non-string entries defensively', () => {
        const parsed = parseApiErrors({ errors: ['Invalid.', 422, ['Nested.']] })

        expect(parsed.summary).toBe('Invalid. Nested.')
        expect(parsed.fieldErrors).toEqual({})
    })

    it('unexpected `errors` type never throws', () => {
        expect(parseApiErrors({ errors: 'oops' })).toEqual({ fieldErrors: {}, summary: null })
    })
})

describe('ApiResponseError', () => {
    it('carries the HTTP status and a stable name', () => {
        const error = new ApiResponseError('Failed to load reports', 403)

        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('ApiResponseError')
        expect(error.message).toBe('Failed to load reports')
        expect(error.status).toBe(403)
        expect(error.data).toBeUndefined()
    })
})

describe('isAuthDenialStatus', () => {
    it('matches the auth-deny statuses 403 and 419', () => {
        expect(isAuthDenialStatus(403)).toBe(true)
        expect(isAuthDenialStatus(419)).toBe(true)
    })

    it('leaves every other status out, including the 401 that no v3 backend emits', () => {
        expect(isAuthDenialStatus(401)).toBe(false)
        expect(isAuthDenialStatus(200)).toBe(false)
        expect(isAuthDenialStatus(404)).toBe(false)
        expect(isAuthDenialStatus(420)).toBe(false)
        expect(isAuthDenialStatus(500)).toBe(false)
    })
})

describe('isAuthDenialError', () => {
    it('accepts ApiResponseError instances carrying an auth-deny status', () => {
        expect(isAuthDenialError(new ApiResponseError('Denied', 403))).toBe(true)
        expect(isAuthDenialError(new ApiResponseError('Expired CSRF', 419))).toBe(true)
    })

    it('rejects ApiResponseError instances with a non-deny status', () => {
        expect(isAuthDenialError(new ApiResponseError('Boom', 401))).toBe(false)
        expect(isAuthDenialError(new ApiResponseError('Boom', 500))).toBe(false)
    })

    it('accepts duck-typed errors whose numeric status is an auth denial', () => {
        expect(isAuthDenialError({ status: 403 })).toBe(true)
        expect(isAuthDenialError({ status: 419 })).toBe(true)
    })

    it('rejects plain errors and anything without a numeric auth-deny status', () => {
        expect(isAuthDenialError(new Error('network'))).toBe(false)
        expect(isAuthDenialError({ status: '403' })).toBe(false)
        expect(isAuthDenialError({ status: null })).toBe(false)
        expect(isAuthDenialError({})).toBe(false)
        expect(isAuthDenialError('boom')).toBe(false)
        expect(isAuthDenialError(null)).toBe(false)
        expect(isAuthDenialError(undefined)).toBe(false)
    })
})
