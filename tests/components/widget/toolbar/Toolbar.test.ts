import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, provide } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { TooltipProvider } from 'reka-ui'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))

import Toolbar from '@/components/widget/toolbar/Toolbar.vue'
import { useWalkthrough, type WalkthroughControls } from '@/composables/useWalkthrough'

let wrapper: VueWrapper | undefined

function makeStore() {
    return {
        auth: { user: { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' } as Record<string, unknown> | null },
        settings: { position: 'bottom-right', theme: 'light', expanded: true },
        capabilities: { capture: false },
        report: { loaded: false, pending: null as Record<string, unknown> | null },
        filter: { type: null as string | null },
        mode: null as string | null,
        capturing: false,
        unresolvedCount: 0,
        feature: () => true,
        loadReports: vi.fn(),
        unloadReports: vi.fn(),
        closeReport: vi.fn(),
    }
}

/** Real toolbar + real composable: the reported bug lived in their binding, not in either alone. */
function mountToolbar() {
    const store = makeStore()
    let tour: WalkthroughControls | undefined
    const Host = {
        setup() {
            tour = useWalkthrough()
            provide('walkthrough', tour)
            return () => h(TooltipProvider, null, () => h(Toolbar))
        },
    }
    wrapper = mount(Host, {
        global: {
            provide: {
                redline: { api: { auth: { logout: vi.fn() } }, config: { guest: false, dashboard: 'https://app.test/redline' } },
                store,
                modeManager: { activatePin: vi.fn(), activateAnnotation: vi.fn(), activateVideo: vi.fn(), exitCurrentMode: vi.fn() },
            },
        },
    })
    return { store, tour: tour! }
}

function ringedButtons() {
    return wrapper!.findAll('button.ring-2')
}

function commentButton() {
    return wrapper!.find('button[aria-label="Pin a comment"]')
}

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
})

describe('Toolbar walkthrough ring', () => {
    it('shows no ring for a signed-in user with the toolbar expanded and no tour running', async () => {
        const { store, tour } = mountToolbar()
        await flushPromises()

        // The exact reported scenario: authenticated, non-guest, expanded, tour inactive.
        expect(store.auth.user).not.toBeNull()
        expect(store.settings.expanded).toBe(true)
        expect(tour.active).toBe(false)
        expect(tour.steps.length).toBeGreaterThan(0)
        expect(ringedButtons()).toHaveLength(0)
    })

    it('rings only the current target while the tour runs', async () => {
        const { tour } = mountToolbar()
        await flushPromises()

        tour.start()
        await flushPromises()

        expect(ringedButtons()).toHaveLength(1)
        expect(commentButton().classes()).toContain('ring-2')

        tour.next()
        await flushPromises()

        expect(ringedButtons()).toHaveLength(1)
        expect(commentButton().classes()).not.toContain('ring-2')

        tour.finish()
        await flushPromises()

        expect(ringedButtons()).toHaveLength(0)
    })
})
