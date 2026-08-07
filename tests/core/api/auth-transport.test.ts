import { beforeEach, describe, expect, it } from 'vitest'
import { BearerTransport, CookieTransport } from '@/core/api/auth-transport'

beforeEach(() => {
    // Isolate cookie state between tests.
    document.cookie = 'redline_csrf=; Path=/; Max-Age=0'
})

describe('CookieTransport', () => {
    it('is cookie based and sends same-origin credentials', () => {
        const transport = new CookieTransport()
        const init: RequestInit = { method: 'GET' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(transport.isCookieBased).toBe(true)
        expect(init.credentials).toBe('same-origin')
    })

    it('adds X-Redline-CSRF on non-GET requests when the csrf cookie is present', () => {
        document.cookie = 'redline_csrf=csrf-abc; Path=/'
        const transport = new CookieTransport()
        const init: RequestInit = { method: 'POST' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Redline-CSRF']).toBe('csrf-abc')
    })

    it('does not add X-Redline-CSRF on GET requests', () => {
        document.cookie = 'redline_csrf=csrf-abc; Path=/'
        const transport = new CookieTransport()
        const init: RequestInit = { method: 'GET' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Redline-CSRF']).toBeUndefined()
    })

    it('does not add X-Redline-CSRF when the csrf cookie is absent', () => {
        const transport = new CookieTransport()
        const init: RequestInit = { method: 'DELETE' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Redline-CSRF']).toBeUndefined()
    })

    it('reads the CSRF cookie from a custom configured name', () => {
        document.cookie = 'my_csrf=csrf-zzz; Path=/'
        const transport = new CookieTransport('my_csrf')
        const init: RequestInit = { method: 'POST' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Redline-CSRF']).toBe('csrf-zzz')
    })

    it('updates the CSRF cookie name via setCsrfName', () => {
        document.cookie = 'bootstrap_csrf=csrf-new; Path=/'
        const transport = new CookieTransport('redline_csrf')
        transport.setCsrfName('bootstrap_csrf')
        const init: RequestInit = { method: 'POST' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Redline-CSRF']).toBe('csrf-new')
    })

    it('uses X-Redline-CSRF as the default header on non-GET requests', () => {
        document.cookie = 'redline_csrf=csrf-abc; Path=/'
        const transport = new CookieTransport()
        const init: RequestInit = { method: 'PATCH' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Redline-CSRF']).toBe('csrf-abc')
    })

    it('updates the CSRF header name via setHeaderName', () => {
        document.cookie = 'redline_csrf=csrf-new; Path=/'
        const transport = new CookieTransport()
        transport.setHeaderName('X-Custom-CSRF')
        const init: RequestInit = { method: 'POST' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Custom-CSRF']).toBe('csrf-new')
        expect(headers['X-Redline-CSRF']).toBeUndefined()
    })

    it('matches custom cookie names containing regex metacharacters literally', () => {
        document.cookie = 'redline.csrf[2]=csrf-esc; Path=/'
        const transport = new CookieTransport('redline.csrf[2]')
        const init: RequestInit = { method: 'POST' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['X-Redline-CSRF']).toBe('csrf-esc')
    })
})

describe('BearerTransport', () => {
    it('is not cookie based, omits credentials, and adds the Authorization header', () => {
        const transport = new BearerTransport(() => 'jwt.token')
        const init: RequestInit = { method: 'GET' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(transport.isCookieBased).toBe(false)
        expect(init.credentials).toBe('omit')
        expect(headers['Authorization']).toBe('Bearer jwt.token')
    })

    it('adds no Authorization header when there is no token', () => {
        const transport = new BearerTransport(() => null)
        const init: RequestInit = { method: 'POST' }
        const headers: Record<string, string> = {}

        transport.apply(init, headers)

        expect(headers['Authorization']).toBeUndefined()
    })
})
