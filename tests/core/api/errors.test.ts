import { describe, expect, it } from 'vitest'
import { parseApiErrors } from '@/core/api/errors'

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
