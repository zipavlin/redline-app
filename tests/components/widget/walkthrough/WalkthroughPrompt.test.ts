import { describe, expect, it, vi, afterEach } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

/**
 * Nuxt UI components are auto-imported (unplugin), so name-based stubs cannot
 * replace them - the shared auth harness mocks the package subpaths instead
 * (see tests/support/auth.ts).
 */
vi.mock('@nuxt/ui/components/Modal.vue', () => ({
    default: {
        name: 'UModal',
        props: ['open', 'dismissible', 'close', 'title', 'description', 'ui'],
        emits: ['update:open'],
        template: `
            <div v-if="open" class="u-modal">
                <p class="u-modal-title">{{ title }}</p>
                <slot name="body" />
                <slot name="footer" />
            </div>`,
    },
}))

vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['label', 'variant', 'size', 'color', 'icon', 'ui', 'loading', 'disabled'],
        emits: ['click'],
        template: `<button type="button" @click="$emit('click')"><slot />{{ label }}</button>`,
    },
}))

import WalkthroughPrompt from '@/components/widget/walkthrough/WalkthroughPrompt.vue'

let wrapper: VueWrapper | undefined

interface FakeUser {
    id: string
    name: string
    email: string
    role: string
    walkthrough_seen?: boolean
}

function makeStore(user: FakeUser | null, features: string[] = ['walkthrough']) {
    const markWalkthroughSeen = vi.fn(() => {
        if (user) user.walkthrough_seen = true
    })
    return {
        store: reactive({
            auth: { user },
            feature: (name: string) => features.includes(name),
            markWalkthroughSeen,
        }),
        markWalkthroughSeen,
    }
}

function mountPrompt(user: FakeUser | null, features: string[] = ['walkthrough'], hasTour = true) {
    const { store, markWalkthroughSeen } = makeStore(user, features)
    const start = vi.fn()
    wrapper = mount(WalkthroughPrompt, {
        global: {
            provide: {
                store,
                walkthrough: hasTour ? { active: false, start } : null,
            },
        },
    })
    return { store, markWalkthroughSeen, start }
}

const firstRunUser = (): FakeUser => ({
    id: 'u1',
    name: 'Ada',
    email: 'ada@test.dev',
    role: 'reporter',
    walkthrough_seen: false,
})

function modalOpen() {
    return wrapper!.find('.u-modal').exists()
}

function click(label: string) {
    const button = wrapper!.findAll('button').find(candidate => candidate.text() === label)
    if (!button) throw new Error(`no button labelled ${label}`)
    return button.trigger('click')
}

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
})

describe('walkthrough prompt', () => {
    it('asks a first-run user of a host with the feature on', async () => {
        mountPrompt(firstRunUser())
        await flushPromises()

        expect(modalOpen()).toBe(true)
        expect(wrapper!.text()).toContain('Do you want a short walkthrough?')
        expect(wrapper!.findAll('button').map(button => button.text())).toEqual(['Not now', 'Show me'])
    })

    it('stays closed when the feature is off', async () => {
        mountPrompt(firstRunUser(), [])
        await flushPromises()

        expect(modalOpen()).toBe(false)
    })

    it('stays closed for signed-out visitors and guests', async () => {
        mountPrompt(null)
        await flushPromises()
        expect(modalOpen()).toBe(false)
        wrapper!.unmount()

        mountPrompt({ ...firstRunUser(), role: 'guest' })
        await flushPromises()
        expect(modalOpen()).toBe(false)
    })

    it('stays closed once the user has seen it', async () => {
        mountPrompt({ ...firstRunUser(), walkthrough_seen: true })
        await flushPromises()

        expect(modalOpen()).toBe(false)
    })

    it('stays closed for a user restored from the local cache with no flag yet', async () => {
        // The cached identity carries no walkthrough_seen key - the prompt must wait
        // for the server row instead of flashing on every page load.
        const cached: FakeUser = { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' }
        mountPrompt(cached)
        await flushPromises()

        expect(modalOpen()).toBe(false)
    })

    it('marks the flag seen without starting a tour on "Not now"', async () => {
        const { markWalkthroughSeen, start } = mountPrompt(firstRunUser())
        await flushPromises()

        await click('Not now')
        await flushPromises()

        expect(markWalkthroughSeen).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
        expect(modalOpen()).toBe(false)
    })

    it('marks the flag seen and starts the tour on "Show me"', async () => {
        const { markWalkthroughSeen, start } = mountPrompt(firstRunUser())
        await flushPromises()

        await click('Show me')
        await flushPromises()

        expect(markWalkthroughSeen).toHaveBeenCalledTimes(1)
        expect(start).toHaveBeenCalledTimes(1)
        expect(modalOpen()).toBe(false)
    })
})
