import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from '@/core/api/client'
import { BearerTransport, CookieTransport } from '@/core/api/auth-transport'

function mockFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

function requestInfo(call: unknown[]): { url: string; init: RequestInit } {
    return { url: call[0] as string, init: call[1] as RequestInit }
}

function header(init: RequestInit, name: string): string | undefined {
    return (init.headers as Record<string, string> | undefined)?.[name]
}

afterEach(() => {
    vi.unstubAllGlobals()
})

beforeEach(() => {
    document.cookie = 'redline_csrf=; Path=/; Max-Age=0'
})

describe('ApiClient transport wiring', () => {
    it('cookie transport: sends same-origin credentials and no Authorization header', async () => {
        const fetchMock = mockFetch()
        const client = new ApiClient('https://app.test/redline/api', new CookieTransport())

        await client.get('auth/me')

        const { url, init } = requestInfo(fetchMock.mock.calls[0])
        expect(url).toBe('https://app.test/redline/api/auth/me')
        expect(init.credentials).toBe('same-origin')
        expect(header(init, 'Authorization')).toBeUndefined()
    })

    it('bearer transport: adds the Authorization header and omits credentials', async () => {
        const fetchMock = mockFetch()
        const client = new ApiClient('https://app.test/redline/api', new BearerTransport(() => 'jwt.abc'))

        await client.get('auth/me')

        const { init } = requestInfo(fetchMock.mock.calls[0])
        expect(init.credentials).toBe('omit')
        expect(header(init, 'Authorization')).toBe('Bearer jwt.abc')
    })

    it('bearer transport: no Authorization header when there is no token', async () => {
        const fetchMock = mockFetch()
        const client = new ApiClient('https://app.test/redline/api', new BearerTransport(() => null))

        await client.get('auth/me')

        const { init } = requestInfo(fetchMock.mock.calls[0])
        expect(header(init, 'Authorization')).toBeUndefined()
    })

    it('cookie transport: adds X-Redline-CSRF only on non-GET with the csrf cookie present', async () => {
        document.cookie = 'redline_csrf=csrf-xyz; Path=/'
        const fetchMock = mockFetch()
        const client = new ApiClient('https://app.test/redline/api', new CookieTransport())

        await client.post('auth/login', { email: 'a@b.c', password: 'pw' })

        const login = requestInfo(fetchMock.mock.calls[0])
        expect(login.url).toBe('https://app.test/redline/api/auth/login')
        expect(login.init.method).toBe('POST')
        expect(header(login.init, 'X-Redline-CSRF')).toBe('csrf-xyz')

        // A following GET carries no CSRF header even though the cookie is set.
        await client.get('auth/me')

        const me = requestInfo(fetchMock.mock.calls[1])
        expect(me.init.method).toBe('GET')
        expect(header(me.init, 'X-Redline-CSRF')).toBeUndefined()
    })

    it('cookie transport: DELETE sends the method and JSON body with the CSRF header', async () => {
        document.cookie = 'redline_csrf=csrf-xyz; Path=/'
        const fetchMock = mockFetch()
        const client = new ApiClient('https://app.test/redline/api', new CookieTransport())

        await client.delete('report/r1/member', { user_ids: ['u1'] })

        const { url, init } = requestInfo(fetchMock.mock.calls[0])
        expect(url).toBe('https://app.test/redline/api/report/r1/member')
        expect(init.method).toBe('DELETE')
        expect(init.body).toBe(JSON.stringify({ user_ids: ['u1'] }))
        expect(header(init, 'Content-Type')).toBe('application/json')
        expect(header(init, 'X-Redline-CSRF')).toBe('csrf-xyz')
    })
})
