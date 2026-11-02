import { describe, expect, it } from 'vitest'
import { ApiResponseError } from '@/core/api/errors'
import { isMemberFilterDenied } from '@/components/dashboard/pages/reports/memberFilter'

describe('isMemberFilterDenied', () => {
    it('treats a plain 403 as the member-policy denial', () => {
        expect(isMemberFilterDenied(new ApiResponseError('Forbidden', 403, {
            message: 'You do not have permission to view member candidates.',
        }))).toBe(true)
    })

    it('does NOT deny the member filter for a 403 carrying the unauthenticated marker', () => {
        expect(isMemberFilterDenied(new ApiResponseError('Unauthenticated', 403, {
            message: 'Unauthenticated.',
            error: 'unauthenticated',
        }))).toBe(false)
    })

    it('does not deny for other auth-deny statuses carrying the marker', () => {
        expect(isMemberFilterDenied(new ApiResponseError('Unauthenticated', 401, {
            message: 'Unauthenticated.',
            error: 'unauthenticated',
        }))).toBe(false)
    })

    it('does not deny on other statuses or missing errors', () => {
        expect(isMemberFilterDenied(new ApiResponseError('Validation failed', 422, { errors: {} }))).toBe(false)
        expect(isMemberFilterDenied(new ApiResponseError('Unauthorized', 401))).toBe(false)
        expect(isMemberFilterDenied(null)).toBe(false)
        expect(isMemberFilterDenied(undefined)).toBe(false)
    })
})