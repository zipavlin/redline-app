import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePassword, passwordStrength } from '@/core/password'

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

describe('passwordStrength', () => {
    it('scores an empty password 0 with no label', () => {
        expect(passwordStrength('')).toEqual({ score: 0, label: '', color: 'error' })
    })

    it('scores short, single-class passwords low', () => {
        expect(passwordStrength('abc').score).toBe(1)
        expect(passwordStrength('abc').label).toBe('Weak')
        expect(passwordStrength('abcd1234').score).toBeLessThan(3)
    })

    it('scores a long, mixed-class password at the top', () => {
        const strong = passwordStrength('A1!aA1!aA1!aA1!')
        expect(strong.score).toBe(4)
        expect(strong.label).toBe('Strong')
        expect(strong.color).toBe('success')
    })

    it('is monotonic: longer + more varied is never weaker', () => {
        const weak = passwordStrength('short')
        const strong = passwordStrength('Short3!9LongerPass')
        expect(strong.score).toBeGreaterThanOrEqual(weak.score)
        expect(strong.score).toBeGreaterThan(weak.score)
    })
})
