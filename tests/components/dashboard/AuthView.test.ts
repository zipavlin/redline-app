import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

/**
 * U* component + useToast mocks are registered by the shared auth harness; their
 * hoisted module mocks cover both auth modals this page renders.
 */
import {
    defaultUser,
    createAuthStore,
    createAuthApi,
    unmountAuthMounts,
    findButton,
} from '../../support/auth'
import { resetBrowserGlobals } from '../../support/browser'
import AuthView from '@/components/dashboard/AuthView.vue'

type AuthUser = typeof defaultUser & { isDeveloper: boolean; isAdmin: boolean }

interface AuthViewStore {
    auth: {
        user: AuthUser | null
        callback: (() => void) | null
        authView: 'login' | 'register'
    }
    activateSession: (user: typeof defaultUser, token?: string, options?: { rememberMe?: boolean }) => void
}

/**
 * AuthView's watchers react to store changes, so the plain harness store must
 * be wrapped in `reactive` - otherwise the watchers never fire in tests.
 */
function createStore(): AuthViewStore {
    return reactive(createAuthStore())
}

afterEach(() => {
    unmountAuthMounts()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    resetBrowserGlobals()
})

async function mountAuthView(config: Record<string, unknown>, store: AuthViewStore, api = createAuthApi()) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: 'home', component: { template: '<div />' } },
            { path: '/register', component: AuthView, meta: { standalone: true } },
        ],
    })
    await router.push('/register')

    const wrapper = mount(AuthView, {
        global: { provide: { redline: { api, config }, store }, plugins: [router] },
    })
    await flushPromises()

    return { wrapper, router, store, api }
}

describe('AuthView', () => {
    it('starts on the register view and primes the auth callback when registration is enabled', async () => {
        const store = createStore()
        await mountAuthView({ surface: 'dashboard', canRegister: true }, store)

        expect(store.auth.authView).toBe('register')
        expect(store.auth.callback).not.toBeNull()
    })

    it('starts on the login view when registration is disabled', async () => {
        const store = createStore()
        await mountAuthView({ surface: 'dashboard', canRegister: false }, store)

        expect(store.auth.authView).toBe('login')
    })

    it('round-trips between the register and login views through the modal links', async () => {
        const store = createStore()
        const { wrapper } = await mountAuthView({ surface: 'dashboard', canRegister: true }, store)

        await findButton(wrapper, 'Create one')!.trigger('click')
        await flushPromises()
        expect(store.auth.authView).toBe('register')

        await findButton(wrapper, 'Already have an account? Sign in')!.trigger('click')
        await flushPromises()
        expect(store.auth.authView).toBe('login')
    })

    it('redirects to the dashboard immediately when a user session is already cached', async () => {
        const store = createStore()
        store.auth.user = { ...defaultUser, isDeveloper: false, isAdmin: false }
        const { router } = await mountAuthView({ surface: 'dashboard', canRegister: true }, store)

        expect(router.currentRoute.value.path).toBe('/')
    })

    it('leaves the page when the modal is closed', async () => {
        const store = createStore()
        const { wrapper, router } = await mountAuthView({ surface: 'dashboard', canRegister: true }, store)

        await wrapper.find('.u-modal-close').trigger('click')
        await flushPromises()

        expect(router.currentRoute.value.path).toBe('/')
        expect(store.auth.callback).toBeNull()
        expect(store.auth.authView).toBe('login')
    })

    it('redirects to the dashboard after a successful login', async () => {
        const store = createStore()
        store.activateSession = vi.fn((user: AuthUser) => {
            store.auth.user = user
        })
        const api = createAuthApi()
        api.auth.login = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: { user: { ...defaultUser }, token: 't' },
        })
        const { wrapper, router } = await mountAuthView({ surface: 'dashboard', canRegister: true }, store, api)

        await wrapper.find('input[type="email"]').setValue('ada@test.dev')
        await wrapper.find('input[type="password"]').setValue('secret')
        await findButton(wrapper, 'Sign in')!.trigger('click')
        await flushPromises()

        expect(router.currentRoute.value.path).toBe('/')
    })

    it('cleans up the auth store state when the page unmounts', async () => {
        const store = createStore()
        const { wrapper } = await mountAuthView({ surface: 'dashboard', canRegister: true }, store)

        wrapper.unmount()

        /**
         * Non-authed visitors leave a non-null callback behind so the dashboard's
         * login modal stays open (its normal gate) when they land on `/`.
         */
        expect(typeof store.auth.callback).toBe('function')
        expect(store.auth.authView).toBe('login')
    })
})
