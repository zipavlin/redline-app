import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePassword } from '@/core/password'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'

describe('generatePassword', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns a string of the default length 16', () => {
        expect(generatePassword()).toHaveLength(16)
    })

    it('honours a custom length argument', () => {
        expect(generatePassword(24)).toHaveLength(24)
    })

    it('only contains characters from the charset', () => {
        const password = generatePassword(64)
        expect(password).toHaveLength(64)
        expect([...password].every(char => CHARSET.includes(char))).toBe(true)
    })

    it('returns different values across calls', () => {
        expect(generatePassword()).not.toBe(generatePassword())
    })

    it('uses crypto.getRandomValues', () => {
        const spy = vi.spyOn(crypto, 'getRandomValues')
        generatePassword(16)
        expect(spy).toHaveBeenCalled()
    })
})
