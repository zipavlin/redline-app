import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: vi.fn() }) }))

import AuthLogin from '@/components/shared/auth/AuthLogin.vue'

const store = {
    auth: { user: null, callback: () => {}, authView: 'login' },
    activateSession: vi.fn(),
}

const defaultLoginResult = {
    ok: true,
    status: 200,
    data: { user: { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' }, token: 't' },
}

let wrapper: VueWrapper | undefined

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
})

function mountLogin(config: Record<string, unknown>, loginResult: unknown = defaultLoginResult) {
    wrapper = mount(AuthLogin, {
        global: {
            provide: {
                redline: {
                    api: { auth: { login: vi.fn().mockResolvedValue(loginResult) } },
                    config,
                },
                store,
            },
            stubs: {
                UModal: { template: '<div><slot name="body" /><slot name="footer" /></div>' },
                UButton: {
                    template: '<button @click="$emit(\'click\')"><slot />{{ label }}</button>',
                    props: ['label', 'variant', 'size', 'icon', 'trailingIcon'],
                },
                UFormField: { template: '<div><slot /><p v-if="error">{{ error }}</p></div>', props: ['error'] },
                UInput: { template: '<input />' },
                UCheckbox: { template: '<input type="checkbox" />' },
            },
        },
    })
    return wrapper
}

// The real (unstubbed) UModal teleports into <body> and its reka presence
// animation renders the content a tick after mount, so assertions read the
// rendered modal from document.body.
async function flushModal() {
    await flushPromises()
    await new Promise(r => setTimeout(r, 50))
    await flushPromises()
}

function bodyText(): string {
    return document.body.textContent ?? ''
}

describe('AuthLogin', () => {
    it('widget surface shows "Need an account?" linking to the dashboard', async () => {
        mountLogin({
            surface: 'widget',
            canRegister: true,
            dashboard: 'https://app.test/redline',
        })
        await flushModal()
        expect(bodyText()).toContain('Need an account?')
        expect(bodyText()).toContain('Need an account? Go to dashboard')
        expect(bodyText()).not.toContain('Create one')
    })

    it('dashboard surface keeps the inline "Create one" registration link', async () => {
        mountLogin({
            surface: 'dashboard',
            canRegister: true,
            mailConfigured: false,
        })
        await flushModal()
        expect(bodyText()).toContain("Don't have an account?")
        expect(bodyText()).toContain('Create one')
        expect(bodyText()).not.toContain('Need an account?')
    })

    it('widget surface hides the account prompt when registration is disabled', async () => {
        mountLogin({
            surface: 'widget',
            canRegister: false,
            dashboard: 'https://app.test/redline',
        })
        await flushModal()
        expect(bodyText()).not.toContain('Need an account?')
        expect(bodyText()).not.toContain('Create one')
    })

    it('opens the dashboard in a new tab when the widget link is clicked', async () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null)
        mountLogin({
            surface: 'widget',
            canRegister: true,
            dashboard: 'https://app.test/redline',
        })
        await flushModal()

        const buttons = Array.from(document.body.querySelectorAll('button'))
        const dashboardButton = buttons.find(b => b.textContent?.includes('Go to dashboard'))
        expect(dashboardButton).toBeDefined()
        dashboardButton!.click()

        expect(open).toHaveBeenCalledWith('https://app.test/redline', '_blank', 'noopener')
        open.mockRestore()
    })

    it('shows field-keyed validation errors and no Network error on a 422 login failure', async () => {
        mountLogin(
            { surface: 'dashboard', mailConfigured: false },
            {
                ok: false,
                status: 422,
                data: {
                    errors: {
                        email: ['The email field is required.'],
                        password: ['The password field is required.'],
                    },
                },
            },
        )
        await flushModal()

        const buttons = Array.from(document.body.querySelectorAll('button'))
        const signIn = buttons.find(b => b.textContent?.includes('Sign in'))
        expect(signIn).toBeDefined()
        signIn!.click()
        await flushPromises()

        expect(bodyText()).toContain('The email field is required.')
        expect(bodyText()).toContain('The password field is required.')
        expect(bodyText()).not.toContain('Network error')
    })

    it('shows the joined summary and no field messages on a flat-errors login failure', async () => {
        mountLogin(
            { surface: 'dashboard', mailConfigured: false },
            { ok: false, status: 401, data: { errors: ['Invalid credentials.'] } },
        )
        await flushModal()

        const buttons = Array.from(document.body.querySelectorAll('button'))
        const signIn = buttons.find(b => b.textContent?.includes('Sign in'))
        expect(signIn).toBeDefined()
        signIn!.click()
        await flushPromises()

        expect(bodyText()).toContain('Invalid credentials.')
        expect(bodyText()).not.toContain('The email field is required.')
        expect(bodyText()).not.toContain('The password field is required.')
        expect(bodyText()).not.toContain('Network error')
    })
})
