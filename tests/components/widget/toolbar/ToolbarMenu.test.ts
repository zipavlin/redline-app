import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, provide } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { TooltipProvider } from 'reka-ui'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))

import ToolbarMenu from '@/components/widget/toolbar/ToolbarMenu.vue'
import { useWalkthrough, type WalkthroughControls } from '@/composables/useWalkthrough'
import { identity } from '@/core/storage'

const user = { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' }

let store: ReturnType<typeof makeStore>
let wrapper: VueWrapper | undefined

function makeStore(currentUser: typeof user | null = user) {
    return {
        auth: { user: currentUser },
        settings: { position: 'bottom-right', theme: 'light', expanded: false },
        report: { loaded: false, filter: { type: null }, pending: null },
        filter: { type: null },
        capturing: false,
        mode: null,
        unresolvedCount: 3,
        feature: () => true,
        loadReports: vi.fn(),
        unloadReports: vi.fn(),
    }
}

/**
 * Auto-imported Nuxt UI components resolve to real file imports (unplugin) and
 * render for real - name-based `global.stubs` cannot intercept them. ToolbarMenu
 * uses UTooltip, which needs reka-ui's TooltipProvider (same pattern as CommentList.test.ts).
 */
function mountMenu(api: { logout: () => Promise<unknown> }, tour: { active: boolean; start: () => void; stop: () => void } = { active: false, start: vi.fn(), stop: vi.fn() }) {
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
                walkthrough: tour,
            },
        },
    })
}

/**
 * The real composable behind the real menu - the stubbed-tour tests cannot catch a
 * `stop()` that runs without a tour, because a stub never restores `expanded`.
 */
function mountMenuWithRealTour(currentUser: typeof user | null = user): WalkthroughControls {
    store = makeStore(currentUser)
    store.settings.expanded = true
    let tour: WalkthroughControls | undefined
    const Host = {
        setup() {
            tour = useWalkthrough()
            provide('walkthrough', tour)
            return () => h(TooltipProvider, null, () => h(ToolbarMenu))
        },
    }
    wrapper = mount(Host, {
        global: {
            provide: {
                redline: { api: { auth: { logout: vi.fn() } }, config: { dashboard: 'https://app.test/redline' } },
                store,
            },
        },
    })
    return tour!
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

describe('ToolbarMenu walkthrough replay', () => {
    it('starts the tour from the main view', async () => {
        const start = vi.fn()
        wrapper = mountMenu({ logout: vi.fn() }, { active: false, start })

        const trigger = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Account')!
        await trigger.trigger('click')
        await flushModal()

        const entry = bodyButtons().find(b => b.textContent?.includes('Show walkthrough'))
        expect(entry, 'replay entry should be offered in the main view').toBeDefined()

        entry!.click()
        await flushModal()

        expect(start).toHaveBeenCalledTimes(1)
    })
})

/**
 * Escape is arbitrated in this one handler: closing the menu and ending the tour
 * must never happen on the same keypress.
 */
describe('ToolbarMenu Escape arbitration', () => {
    function pressEscape() {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        return flushModal()
    }

    it('ends an active tour when the menu is closed', async () => {
        const stop = vi.fn()
        wrapper = mountMenu({ logout: vi.fn() }, { active: true, start: vi.fn(), stop })
        await flushModal()

        await pressEscape()

        expect(stop).toHaveBeenCalledTimes(1)
    })

    it('only closes the open menu, leaving the tour running', async () => {
        const stop = vi.fn()
        wrapper = mountMenu({ logout: vi.fn() }, { active: true, start: vi.fn(), stop })

        const trigger = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Account')!
        await trigger.trigger('click')
        await flushModal()
        expect(logoutButton()).toBeDefined()

        await pressEscape()

        expect(stop).not.toHaveBeenCalled()
        expect(logoutButton()).toBeUndefined()
    })

    it('leaves a toolbar the user expanded alone when no tour is running', async () => {
        const tour = mountMenuWithRealTour()
        await flushModal()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await flushModal()

        expect(tour.active).toBe(false)
        expect(store.settings.expanded).toBe(true)
    })
})
