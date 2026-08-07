import { describe, expect, it, vi } from 'vitest'
import { applyBootstrap, fetchBootstrap, type BootstrapResponse } from '@/core/bootstrap'
import type { ApiClient } from '@/core/api/client'

const fullBootstrap: BootstrapResponse = {
    version: 1,
    features: ['screenshots', 'videos', 'files', 'comments', 'mentions'],
    capabilities: {
        guest_reporting: true,
        auth: {
            can_login: true,
            can_register: true,
            fields: [{ name: 'pin', type: 'pin', label: 'PIN', placeholder: '#', length: 6 }],
            can_select_role: true,
            requires_approval: true,
            requires_email_verification: false,
        },
        mail: { configured: true },
    },
    csrf: { cookie: 'bootstrap_csrf', header: 'X-Redline-CSRF' },
}

describe('applyBootstrap', () => {
    it('maps the nested wire shape onto all eight runtime keys and leaves unrelated keys untouched', () => {
        const config: Record<string, unknown> = {
            url: 'https://app.test/redline/api',
            features: [],
            guest: false,
        }

        applyBootstrap(config, fullBootstrap)

        expect(config.features).toEqual(fullBootstrap.features)
        expect(config.guest).toBe(true)
        expect(config.canLogin).toBe(true)
        expect(config.canRegister).toBe(true)
        expect(config.requiresApproval).toBe(true)
        expect(config.mailConfigured).toBe(true)
        expect(config.fields).toEqual(fullBootstrap.capabilities.auth.fields)
        expect(config.csrfCookie).toBe('bootstrap_csrf')
        // Unrelated keys are not touched.
        expect(config.url).toBe('https://app.test/redline/api')
    })

    it('maps false-y values exactly', () => {
        const config: Record<string, unknown> = {}
        const bootstrap: BootstrapResponse = {
            version: 1,
            features: [],
            capabilities: {
                guest_reporting: false,
                auth: {
                    can_login: false,
                    can_register: false,
                    fields: [],
                    can_select_role: false,
                    requires_approval: false,
                    requires_email_verification: false,
                },
                mail: { configured: false },
            },
            csrf: { cookie: 'redline_csrf', header: 'X-Redline-CSRF' },
        }

        applyBootstrap(config, bootstrap)

        expect(config.features).toEqual([])
        expect(config.guest).toBe(false)
        expect(config.canLogin).toBe(false)
        expect(config.canRegister).toBe(false)
        expect(config.requiresApproval).toBe(false)
        expect(config.mailConfigured).toBe(false)
        expect(config.fields).toEqual([])
        expect(config.csrfCookie).toBe('redline_csrf')
    })
})

describe('fetchBootstrap', () => {
    it('returns the payload on a 200 ok result', async () => {
        const get = vi.fn().mockResolvedValue({ ok: true, status: 200, data: fullBootstrap })
        const client = { get } as unknown as Pick<ApiClient, 'get'>

        await expect(fetchBootstrap(client)).resolves.toEqual(fullBootstrap)
        expect(get).toHaveBeenCalledWith('bootstrap')
    })

    it('returns null on a non-2xx result', async () => {
        const get = vi.fn().mockResolvedValue({ ok: false, status: 404, data: null })
        const client = { get } as unknown as Pick<ApiClient, 'get'>

        await expect(fetchBootstrap(client)).resolves.toBeNull()
    })

    it('returns null when the request rejects (network failure)', async () => {
        const get = vi.fn().mockRejectedValue(new Error('network down'))
        const client = { get } as unknown as Pick<ApiClient, 'get'>

        await expect(fetchBootstrap(client)).resolves.toBeNull()
    })

    it('returns null on a malformed body', async () => {
        const get = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { nope: true } })
        const client = { get } as unknown as Pick<ApiClient, 'get'>

        await expect(fetchBootstrap(client)).resolves.toBeNull()
    })
})
