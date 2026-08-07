import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { TooltipProvider } from 'reka-ui'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))

import ToolbarMenu from '@/components/widget/toolbar/ToolbarMenu.vue'
import { identity } from '@/core/storage'

const user = { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' }

let store: ReturnType<typeof makeStore>
let wrapper: VueWrapper | undefined

function makeStore(currentUser: typeof user | null = user) {
    return {
        auth: { user: currentUser },
        settings: { position: 'bottom-right', theme: 'light', expanded: false },
        report: { loaded: false, filter: { type: null } },
        filter: { type: null },
        unresolvedCount: 3,
        loadReports: vi.fn(),
        unloadReports: vi.fn(),
    }
}

/**
 * Auto-imported Nuxt UI components resolve to real file imports (unplugin) and
 * render for real - name-based `global.stubs` cannot intercept them. ToolbarMenu
 * uses UTooltip, which needs reka-ui's TooltipProvider (same pattern as CommentList.test.ts).
 */
function mountMenu(api: { logout: () => Promise<unknown> }) {
    store = makeStore()
    const Host = defineComponent({
        components: { ToolbarMenu, TooltipProvider },
        template: '<TooltipProvider><ToolbarMenu /></TooltipProvider>',
    })
    return mount(Host, {
        global: {
            provide: {
                redline: { api: { auth: api }, config: { dashboard: 'https://app.test/redline' } },
                store,
            },
        },
    })
}

/**
 * The real UPopover teleports its content into <body> (reka presence animation
 * renders it a tick after mount), so assertions read the rendered menu from there.
 */
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
    const trigger = wrapper!.findAll('button').find(b => b.attributes('aria-label') === 'Account')!
    await trigger.trigger('click')
    await flushModal()
    expect(logoutButton(), 'log out button should appear after opening the menu').toBeDefined()
    logoutButton()!.click()
    await flushModal()
}

beforeEach(() => {
    toastAdd.mockClear()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
})

describe('ToolbarMenu logout', () => {
    it('clears identity and drops the report list on successful logout', async () => {
        const clearUser = vi.spyOn(identity, 'clearUser')
        const clearTokenVerified = vi.spyOn(identity, 'clearTokenVerified')
        const logout = vi.fn().mockResolvedValue({ ok: true, status: 204, data: null })

        wrapper = mountMenu({ logout })
        await openMenuAndClickLogout()

        expect(logout).toHaveBeenCalledTimes(1)
        expect(clearUser).toHaveBeenCalled()
        expect(clearTokenVerified).toHaveBeenCalled()
        expect(store.auth.user).toBeNull()
        expect(store.unloadReports).toHaveBeenCalled()
        expect(store.unresolvedCount).toBe(0)
        expect(toastAdd).not.toHaveBeenCalled()
    })

    it('keeps the identity and the report list when the server refuses logout', async () => {
        const clearUser = vi.spyOn(identity, 'clearUser')
        const clearTokenVerified = vi.spyOn(identity, 'clearTokenVerified')
        const logout = vi.fn().mockResolvedValue({ ok: false, status: 500, data: null })

        wrapper = mountMenu({ logout })
        await openMenuAndClickLogout()

        expect(logout).toHaveBeenCalledTimes(1)
        expect(clearUser).not.toHaveBeenCalled()
        expect(clearTokenVerified).not.toHaveBeenCalled()
        expect(store.auth.user).toEqual(user)
        expect(store.unloadReports).not.toHaveBeenCalled()
        expect(store.unresolvedCount).toBe(3)
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Could not log out', color: 'error' })
    })

    it('keeps the identity on network failure and shows a distinct error', async () => {
        const clearUser = vi.spyOn(identity, 'clearUser')
        const clearTokenVerified = vi.spyOn(identity, 'clearTokenVerified')
        const logout = vi.fn().mockRejectedValue(new Error('network down'))

        wrapper = mountMenu({ logout })
        await openMenuAndClickLogout()

        expect(logout).toHaveBeenCalledTimes(1)
        expect(clearUser).not.toHaveBeenCalled()
        expect(clearTokenVerified).not.toHaveBeenCalled()
        expect(store.auth.user).toEqual(user)
        expect(store.unloadReports).not.toHaveBeenCalled()
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Could not log out - check your connection', color: 'error' })
    })
})
