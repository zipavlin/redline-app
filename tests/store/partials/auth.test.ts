import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { authSlice } from '@/store/partials/auth'

function createRedline() {
    return {
        config: { features: [], loginMode: 'credentials', cookieTransport: true },
        api: {
            auth: {
                me: vi.fn().mockRejectedValue(new Error('no session')),
                refresh: vi.fn(),
                login: vi.fn(),
            },
        },
    } as any
}

function seedCachedUser(overrides: Record<string, string> = {}) {
    localStorage.setItem('redline_name', 'Ada')
    localStorage.setItem('redline_email', 'ada@example.com')
    localStorage.setItem('redline_role', 'developer')
    for (const [k, v] of Object.entries(overrides)) localStorage.setItem(k, v)
}

const ME_OK = (overrides: Record<string, unknown> = {}) => ({
    ok: true,
    status: 200,
    data: {
        user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'developer', ...overrides },
    },
})

/** Yield to the microtask queue so async continuations (promise chains, vue's
 *  nextTick scheduler) run. Not a wall-clock sleep. */
async function drainPromises() {
    for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe('authSlice', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('prepopulates the user synchronously from the cached identity', () => {
        seedCachedUser({ redline_role: 'admin' })

        const { auth } = authSlice(createRedline())

        expect(auth.user).toEqual(expect.objectContaining({
            name: 'Ada',
            email: 'ada@example.com',
            role: 'admin',
            isAdmin: true,
            isDeveloper: true,
        }))
        expect(auth.authView).toBe('login')
    })

    it('starts logged out without a cached identity', () => {
        const { auth } = authSlice(createRedline())
        expect(auth.user).toBeNull()
    })

    it('clears the cached user when the session check returns 401', async () => {
        seedCachedUser()
        const redline = createRedline()
        redline.api.auth.me.mockResolvedValue({ ok: false, status: 401, data: null })

        const { auth } = authSlice(redline)
        // Prepopulated synchronously, cleared once the check lands.
        expect(auth.user).not.toBeNull()

        await vi.waitFor(() => expect(auth.user).toBeNull())
        expect(localStorage.getItem('redline_name')).toBeNull()
        expect(localStorage.getItem('redline_email')).toBeNull()
    })

    it('keeps the cached user when the session check rejects (network failure)', async () => {
        seedCachedUser()
        const redline = createRedline()
        redline.api.auth.me.mockRejectedValue(new Error('network down'))

        const { auth } = authSlice(redline)
        await vi.waitFor(() => expect(redline.api.auth.me).toHaveBeenCalled())
        await drainPromises()

        // Cached state kept, and the token is deliberately NOT marked verified.
        expect(auth.user).toEqual(expect.objectContaining({ name: 'Ada' }))
        expect(sessionStorage.getItem('redline_session_verified')).toBeNull()
    })

    it('refreshes the session when remember-me is set and stores the fresh token', async () => {
        seedCachedUser({ redline_remember_me: '1' })
        const redline = createRedline()
        redline.api.auth.me.mockResolvedValue(ME_OK())
        redline.api.auth.refresh.mockResolvedValue({
            ok: true,
            status: 200,
            data: { token: 'fresh-token', user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'developer' } },
        })

        const { auth } = authSlice(redline)
        await vi.waitFor(() => expect(redline.api.auth.refresh).toHaveBeenCalledTimes(1))

        expect(auth.user).toEqual(expect.objectContaining({ role: 'developer', isDeveloper: true }))
        expect(sessionStorage.getItem('redline_cloud_token')).toBe('fresh-token')
        expect(localStorage.getItem('redline_id')).toBe('u1')
        expect(sessionStorage.getItem('redline_session_verified')).toBe('1')
    })

    it('keeps the session when remember-me refresh succeeds without a token (cookie mode)', async () => {
        seedCachedUser({ redline_remember_me: '1' })
        const redline = createRedline()
        redline.api.auth.me.mockResolvedValue(ME_OK())
        // Local cookie mode: refresh returns ok but no access token.
        redline.api.auth.refresh.mockResolvedValue({
            ok: true,
            status: 200,
            data: { user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'developer' } },
        })

        const { auth } = authSlice(redline)
        /**
         * Wait for the whole _initAuth flow to finish (verified is marked only
         * after the remember-me refresh resolves).
         */
        await vi.waitFor(() => expect(sessionStorage.getItem('redline_session_verified')).toBe('1'))

        expect(sessionStorage.getItem('redline_cloud_token')).toBeNull()
        expect(auth.user).toEqual(expect.objectContaining({ name: 'Ada' }))
    })

    it('keeps the current session when the remember-me refresh fails', async () => {
        seedCachedUser({ redline_remember_me: '1' })
        const redline = createRedline()
        redline.api.auth.me.mockResolvedValue(ME_OK())
        redline.api.auth.refresh.mockRejectedValue(new Error('network down'))

        const { auth } = authSlice(redline)
        await vi.waitFor(() => expect(redline.api.auth.refresh).toHaveBeenCalled())

        expect(auth.user).toEqual(expect.objectContaining({ name: 'Ada' }))
        expect(sessionStorage.getItem('redline_cloud_token')).toBeNull()
    })

    it('checks the session but skips the remembered refresh when already verified this tab', async () => {
        sessionStorage.setItem('redline_session_verified', '1')
        seedCachedUser({ redline_remember_me: '1' })
        const redline = createRedline()
        redline.api.auth.me.mockResolvedValue(ME_OK())

        authSlice(redline)
        await vi.waitFor(() => expect(redline.api.auth.me).toHaveBeenCalledTimes(1))
        await drainPromises()

        // A verified flag no longer skips /auth/me; it only throttles the refresh.
        expect(redline.api.auth.refresh).not.toHaveBeenCalled()
    })

    it('sets the user from the session check when already verified without remember-me', async () => {
        sessionStorage.setItem('redline_session_verified', '1')
        const redline = createRedline()
        redline.api.auth.me.mockResolvedValue(ME_OK())

        const { auth } = authSlice(redline)
        await vi.waitFor(() => expect(auth.user).not.toBeNull())

        expect(redline.api.auth.me).toHaveBeenCalledTimes(1)
        expect(redline.api.auth.refresh).not.toHaveBeenCalled()
    })

    it('does not refresh when remember-me is off', async () => {
        const redline = createRedline()
        redline.api.auth.me.mockResolvedValue(ME_OK())

        const { auth } = authSlice(redline)
        /**
         * User is set before the remember-me branch, so this waitFor proves
         * _initAuth got past the refresh decision.
         */
        await vi.waitFor(() => expect(redline.api.auth.me).toHaveBeenCalled())
        await vi.waitFor(() => expect(auth.user).not.toBeNull())

        expect(redline.api.auth.refresh).not.toHaveBeenCalled()
    })

    describe('activateSession', () => {
        it('invokes the pending callback once, clears it, and persists the session', () => {
            const redline = createRedline()
            const { auth, activateSession } = authSlice(redline)
            const callback = vi.fn()
            auth.callback = callback

            activateSession(
                { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'admin' },
                'cloud-token',
                { rememberMe: true },
            )

            expect(callback).toHaveBeenCalledTimes(1)
            expect(auth.callback).toBeNull()
            expect(auth.user).toEqual(expect.objectContaining({ name: 'Ada', isAdmin: true }))
            expect(localStorage.getItem('redline_name')).toBe('Ada')
            expect(localStorage.getItem('redline_id')).toBe('u1')
            expect(localStorage.getItem('redline_remember_me')).toBe('1')
            expect(sessionStorage.getItem('redline_cloud_token')).toBe('cloud-token')
            expect(sessionStorage.getItem('redline_session_verified')).toBe('1')
        })

        it('stores remember-me as 0 when explicitly disabled', () => {
            const { activateSession } = authSlice(createRedline())

            activateSession({ id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'reporter' }, undefined, { rememberMe: false })

            expect(localStorage.getItem('redline_remember_me')).toBe('0')
        })

        it('does not fail when no callback is pending', () => {
            const { activateSession } = authSlice(createRedline())

            expect(() => {
                activateSession({ id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'reporter' })
            }).not.toThrow()
        })
    })

    describe('session mode', () => {
        function exchangeRedline() {
            const redline = createRedline()
            redline.config.loginMode = 'session'
            redline.api.auth.me.mockResolvedValue({ ok: false, status: 401, data: null })
            return redline
        }

        it('exchanges the host session on a 401 me and activates the returned user', async () => {
            const redline = exchangeRedline()
            redline.api.auth.login.mockResolvedValue({ ok: true, status: 200, data: { user: { ...ME_OK().data.user } } })

            const { auth } = authSlice(redline)
            await vi.waitFor(() => expect(redline.api.auth.login).toHaveBeenCalledTimes(1))

            expect(redline.api.auth.login).toHaveBeenCalledWith({})
            expect(auth.user).toEqual(expect.objectContaining({ name: 'Ada', email: 'ada@example.com' }))
            expect(localStorage.getItem('redline_email')).toBe('ada@example.com')
            expect(localStorage.getItem('redline_id')).toBe('u1')
            expect(sessionStorage.getItem('redline_session_verified')).toBe('1')
        })

        it('fires the pending auth callback when the exchange succeeds', async () => {
            const redline = exchangeRedline()
            redline.api.auth.login.mockResolvedValue({ ok: true, status: 200, data: { user: { ...ME_OK().data.user } } })
            const { auth } = authSlice(redline)
            const callback = vi.fn()
            auth.callback = callback

            await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1))

            expect(auth.callback).toBeNull()
            expect(auth.user).not.toBeNull()
        })

        it('never calls login in credentials mode', async () => {
            const redline = createRedline()
            redline.config.loginMode = 'credentials'
            redline.api.auth.me.mockResolvedValue({ ok: false, status: 401, data: null })

            authSlice(redline)
            await vi.waitFor(() => expect(redline.api.auth.me).toHaveBeenCalled())
            await drainPromises()

            expect(redline.api.auth.login).not.toHaveBeenCalled()
        })

        it('never calls login without the cookie transport', async () => {
            const redline = exchangeRedline()
            redline.config.cookieTransport = false

            authSlice(redline)
            await vi.waitFor(() => expect(redline.api.auth.me).toHaveBeenCalled())
            await drainPromises()

            expect(redline.api.auth.login).not.toHaveBeenCalled()
        })

        it('never calls login when me already returns a user', async () => {
            const redline = exchangeRedline()
            redline.api.auth.me.mockResolvedValue(ME_OK())

            const { auth } = authSlice(redline)
            await vi.waitFor(() => expect(auth.user).not.toBeNull())
            await drainPromises()

            expect(redline.api.auth.login).not.toHaveBeenCalled()
        })

        it('silently ignores a non-2xx exchange result', async () => {
            const redline = exchangeRedline()
            redline.api.auth.login.mockResolvedValue({ ok: false, status: 401, data: null })

            const { auth } = authSlice(redline)
            await vi.waitFor(() => expect(redline.api.auth.login).toHaveBeenCalledTimes(1))
            await drainPromises()

            expect(auth.user).toBeNull()
        })

        it('leaves the app unauthenticated on a 202 pending-approval response even with a user payload', async () => {
            const redline = exchangeRedline()
            redline.api.auth.login.mockResolvedValue({ ok: true, status: 202, data: { user: { ...ME_OK().data.user } } })

            const { auth } = authSlice(redline)
            await vi.waitFor(() => expect(redline.api.auth.login).toHaveBeenCalledTimes(1))
            await drainPromises()

            expect(auth.user).toBeNull()
            expect(localStorage.getItem('redline_email')).toBeNull()
            expect(sessionStorage.getItem('redline_session_verified')).toBeNull()
        })

        it('silently ignores a rejected exchange request', async () => {
            const redline = exchangeRedline()
            redline.api.auth.login.mockRejectedValue(new Error('network down'))

            const { auth } = authSlice(redline)
            await vi.waitFor(() => expect(redline.api.auth.login).toHaveBeenCalledTimes(1))
            await drainPromises()

            expect(auth.user).toBeNull()
        })

        it('exchanges at most once per mount when login mode arrives late', async () => {
            const config = reactive({ features: [], loginMode: 'credentials', cookieTransport: true })
            const redline = {
                config,
                api: {
                    auth: {
                        me: vi.fn().mockResolvedValue({ ok: false, status: 401, data: null }),
                        refresh: vi.fn(),
                        login: vi.fn().mockResolvedValue({ ok: false, status: 401, data: null }),
                    },
                },
            } as any

            authSlice(redline)
            await vi.waitFor(() => expect(redline.api.auth.me).toHaveBeenCalled())
            await drainPromises()
            expect(redline.api.auth.login).not.toHaveBeenCalled()

            config.loginMode = 'session'
            await nextTick()
            await drainPromises()
            expect(redline.api.auth.login).toHaveBeenCalledTimes(1)

            // A later mode round-trip must not trigger a second exchange.
            config.loginMode = 'credentials'
            await nextTick()
            config.loginMode = 'session'
            await nextTick()
            await drainPromises()
            expect(redline.api.auth.login).toHaveBeenCalledTimes(1)
        })
    })
})
