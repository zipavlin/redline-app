import { beforeEach, describe, expect, it } from 'vitest'
import { identity } from '@/core/storage'

beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
})

describe('user identity round-trip', () => {
    it('saves and reads back the user profile', () => {
        identity.saveUser('Jane Smith', 'jane@example.com', 'developer', undefined, 'u-1')

        const user = identity.getUser()
        expect(user).toMatchObject({ id: 'u-1', name: 'Jane Smith', email: 'jane@example.com', role: 'developer', isDeveloper: true })
        expect(identity.hasUser()).toBe(true)
    })

    it('returns null user when name/email are missing', () => {
        expect(identity.getUser()).toBeNull()
    })

    it('clearUser wipes identity', () => {
        identity.saveUser('Jane', 'jane@example.com', 'reporter', undefined, 'u-2')
        identity.clearUser()
        expect(identity.getUser()).toBeNull()
        expect(identity.hasUser()).toBe(false)
    })
})

describe('cloud token (sessionStorage, Bearer auth)', () => {
    it('returns null in local cookie mode (no token provided)', () => {
        identity.saveUser('Jane', 'jane@example.com', 'reporter', undefined, 'u-3')
        expect(identity.getToken()).toBeNull()
    })

    it('stores a cloud access token in sessionStorage when provided', () => {
        identity.saveUser('Jane', 'jane@example.com', 'reporter', 'cloud.jwt.token', 'u-4')
        expect(identity.getToken()).toBe('cloud.jwt.token')
    })

    it('clearUser clears the cloud token', () => {
        identity.saveUser('Jane', 'jane@example.com', 'reporter', 'cloud.jwt.token', 'u-5')
        identity.clearUser()
        expect(identity.getToken()).toBeNull()
        // Profile is gone too.
        expect(identity.hasUser()).toBe(false)
    })
})

describe('remember-me preference', () => {
    it('persists the flag', () => {
        expect(identity.isRememberMe()).toBe(false)
        identity.saveRememberMe(true)
        expect(identity.isRememberMe()).toBe(true)
    })
})

describe('session verification flag', () => {
    it('is unverified by default and verified after marking', () => {
        expect(identity.isTokenVerified()).toBe(false)
        identity.markTokenVerified()
        expect(identity.isTokenVerified()).toBe(true)
    })

    it('clearTokenVerified resets the flag', () => {
        identity.markTokenVerified()
        identity.clearTokenVerified()
        expect(identity.isTokenVerified()).toBe(false)
    })
})
