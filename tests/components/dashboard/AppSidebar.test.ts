import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import AppSidebar from '@/components/dashboard/AppSidebar.vue'
import { identity } from '@/core/storage'

type TestUser = { id: string; name: string; email: string; role: string; isDeveloper?: boolean; isAdmin?: boolean }

const user: TestUser = { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' }

let store: ReturnType<typeof makeStore>
let reload: ReturnType<typeof vi.fn>
let wrapper: VueWrapper | undefined

function makeStore(currentUser: typeof user | null = user) {
    return {
        auth: { user: currentUser },
        settings: { theme: 'light' },
        report: { filter: { mine: false, statusGroup: 'all' } },
        setNotifyNewReports: vi.fn().mockResolvedValue(true),
    }
}

/**
 * Auto-imported Nuxt UI components resolve to real file imports (unplugin) and
 * render for real - name-based `global.stubs` cannot intercept them. The sidebar
 * tree (DashboardSidebar + Popover + NavigationMenu + DashboardSearch) mounts
 * standalone; only the UPopover content is teleported into <body>, so assertions
 * read the account menu from there (same pattern as AuthLogin.test.ts).
 */
function mountSidebar(api: { logout: () => Promise<unknown> }, config: Record<string, unknown> = {}, currentUser: typeof user | null = user) {
    store = makeStore(currentUser)
    return mount(AppSidebar, {
        global: {
            provide: {
                redline: { api: { auth: api }, config },
                store,
            },
        },
    })
}

async function flushModal() {
    await flushPromises()
    await new Promise(r => setTimeout(r, 50))
    await flushPromises()
}

function bodyButtons(): HTMLButtonElement[] {
    return Array.from(document.body.querySelectorAll('button'))
}

function logoutButton(): HTMLButtonElement | undefined {
    return bodyButtons().find(b => b.textContent?.includes('Log out'))
}

async function openMenuAndClickLogout() {
    // The footer account trigger renders the current user's name as its label.
    const trigger = wrapper!.findAll('button').find(b => b.text()?.includes('Ada'))!
    await trigger.trigger('click')
    await flushModal()
    expect(logoutButton(), 'log out button should appear after opening the account menu').toBeDefined()
    logoutButton()!.click()
    await flushModal()
}

beforeEach(() => {
    toastAdd.mockClear()
    reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, configurable: true })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
})

describe('AppSidebar logout', () => {
    it('clears identity, nulls the user, and reloads on successful logout', async () => {
        const clearUser = vi.spyOn(identity, 'clearUser')
        const clearTokenVerified = vi.spyOn(identity, 'clearTokenVerified')
        const logout = vi.fn().mockResolvedValue({ ok: true, status: 204, data: null })

        wrapper = mountSidebar({ logout })
        await openMenuAndClickLogout()

        expect(logout).toHaveBeenCalledTimes(1)
        expect(clearUser).toHaveBeenCalled()
        expect(clearTokenVerified).toHaveBeenCalled()
        expect(store.auth.user).toBeNull()
        expect(reload).toHaveBeenCalledTimes(1)
        expect(toastAdd).not.toHaveBeenCalled()
    })

    it('keeps the identity and does NOT reload when the server refuses logout', async () => {
        const clearUser = vi.spyOn(identity, 'clearUser')
        const clearTokenVerified = vi.spyOn(identity, 'clearTokenVerified')
        const logout = vi.fn().mockResolvedValue({ ok: false, status: 500, data: null })

        wrapper = mountSidebar({ logout })
        await openMenuAndClickLogout()

        expect(logout).toHaveBeenCalledTimes(1)
        expect(clearUser).not.toHaveBeenCalled()
        expect(clearTokenVerified).not.toHaveBeenCalled()
        expect(store.auth.user).toEqual(user)
        expect(reload).not.toHaveBeenCalled()
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Could not log out', color: 'error' })
    })

    it('keeps the identity and does NOT reload on network failure', async () => {
        const clearUser = vi.spyOn(identity, 'clearUser')
        const clearTokenVerified = vi.spyOn(identity, 'clearTokenVerified')
        const logout = vi.fn().mockRejectedValue(new Error('network down'))

        wrapper = mountSidebar({ logout })
        await openMenuAndClickLogout()

        expect(logout).toHaveBeenCalledTimes(1)
        expect(clearUser).not.toHaveBeenCalled()
        expect(clearTokenVerified).not.toHaveBeenCalled()
        expect(store.auth.user).toEqual(user)
        expect(reload).not.toHaveBeenCalled()
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Could not log out - check your connection', color: 'error' })
    })
})

describe('New-report emails toggle', () => {
    function rowInMenu(): HTMLElement | undefined {
        // The toggle is the only role=switch in the account menu (the theme row is a button).
        return document.body.querySelector('[role="switch"]') as HTMLElement | undefined
    }

    async function openMenuAndFindRow(config: Record<string, unknown>, role = 'developer') {
        const logout = vi.fn().mockResolvedValue({ ok: true, status: 204, data: null })
        wrapper = mountSidebar({ logout }, config, {
            ...user,
            role,
            isDeveloper: role === 'developer' || role === 'admin',
            isAdmin: role === 'admin',
        })
        const trigger = wrapper.findAll('button').find(b => b.text()?.includes('Ada'))!
        await trigger.trigger('click')
        await flushModal()
        return rowInMenu()
    }

    it('shows the toggle for a developer when mail is configured', async () => {
        const row = await openMenuAndFindRow({ mailConfigured: true })
        expect(row, 'toggle row should render when mail is configured').toBeDefined()
    })

    it('hides the toggle when no mailer is configured', async () => {
        const row = await openMenuAndFindRow({})
        expect(row).toBeNull()
    })

    it('hides the toggle for a reporter even when mail is configured', async () => {
        const row = await openMenuAndFindRow({ mailConfigured: true }, 'reporter')
        expect(row).toBeNull()
    })
})
