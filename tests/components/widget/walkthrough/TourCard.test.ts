import { beforeEach, describe, expect, it, afterEach } from 'vitest'
import { h, nextTick, provide, reactive } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import TourCard from '@/components/widget/walkthrough/TourCard.vue'
import { useWalkthrough, type WalkthroughControls } from '@/composables/useWalkthrough'

let wrapper: VueWrapper | undefined

function makeStore() {
    return reactive({
        auth: { user: { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter', walkthrough_seen: false } as Record<string, unknown> | null },
        settings: { position: 'bottom-right', theme: 'light', expanded: false },
        report: { pending: null as Record<string, unknown> | null },
        mode: null as string | null,
        capturing: false,
    })
}

/** Mounts the real composable + card, so state transitions are the shipped ones. */
function mountTour() {
    const store = makeStore()
    let tour: WalkthroughControls
    const Host = {
        setup() {
            tour = useWalkthrough()
            provide('walkthrough', tour)
            return () => h(TourCard)
        },
    }
    wrapper = mount(Host, { global: { provide: { store } } })
    return { store, tour: tour! }
}

function buttonWithLabel(label: string) {
    const button = wrapper!.findAll('button').find(candidate => candidate.text() === label)
    if (!button) throw new Error(`no button labelled ${label}`)
    return button
}

function cardText() {
    return wrapper!.text()
}

beforeEach(() => {
    document.body.innerHTML = ''
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
})

describe('walkthrough tour', () => {
    it('starts on the comment step and expands the toolbar it points at', async () => {
        const { store, tour } = mountTour()

        expect(tour.highlight, 'an inactive tour must not light any button').toBeNull()

        tour.start()
        await nextTick()

        expect(store.settings.expanded).toBe(true)
        expect(tour.active).toBe(true)
        expect(tour.highlight).toBe('comment')
        expect(cardText()).toContain('1 of 4')
        expect(cardText()).toContain('Pin a comment')
        expect(buttonWithLabel('Next')).toBeDefined()
    })

    it('highlights nothing while the step has no toolbar target or the tour is over', async () => {
        const { tour } = mountTour()

        tour.start()
        await nextTick()
        tour.next()
        await nextTick()
        expect(tour.highlight).toBe('filter')

        tour.next()
        tour.next()
        await nextTick()
        expect(tour.step?.id).toBe('pin')
        expect(tour.highlight).toBeNull()

        tour.finish()
        await nextTick()
        expect(tour.highlight).toBeNull()
    })

    it('advances with Next and restores the collapsed toolbar on Done', async () => {
        const { store, tour } = mountTour()

        tour.start()
        await nextTick()

        await buttonWithLabel('Next').trigger('click')
        expect(cardText()).toContain('2 of 4')
        expect(cardText()).toContain('Filter the pins')
        tour.prev()
        await nextTick()
        expect(cardText()).toContain('1 of 4')
        tour.next()
        await nextTick()
        await buttonWithLabel('Next').trigger('click')
        expect(cardText()).toContain('Your account')
        await buttonWithLabel('Next').trigger('click')
        expect(cardText()).toContain('Create your first report')

        await buttonWithLabel('Done').trigger('click')
        await nextTick()

        expect(tour.active).toBe(false)
        expect(store.settings.expanded).toBe(false)
    })

    it('keeps the original toolbar setting when a replay starts an active tour again', async () => {
        const { store, tour } = mountTour()

        tour.start()
        tour.start()
        await nextTick()
        await buttonWithLabel('Skip').trigger('click')

        expect(store.settings.expanded).toBe(false)
    })

    it('ends the tour on Skip', async () => {
        const { tour } = mountTour()

        tour.start()
        await nextTick()
        await buttonWithLabel('Skip').trigger('click')

        expect(tour.active).toBe(false)
    })

    it('survives entering pin mode, then shows the form step once the panel opens', async () => {
        const { store, tour } = mountTour()

        tour.start()
        await nextTick()
        tour.next()
        tour.next()
        tour.next()
        await nextTick()
        expect(cardText()).toContain('Create your first report')

        // The pin step tells the user to place a pin, which is exactly what sets mode.
        store.mode = 'pin'
        await nextTick()
        expect(tour.active).toBe(true)
        expect(cardText()).toContain('Create your first report')

        store.report.pending = { pin: { x: 10, y: 10 } }
        await nextTick()

        expect(tour.active).toBe(true)
        expect(tour.step?.id).toBe('body')
        expect(cardText()).toContain('Describe the issue')
    })

    it('ends the tour when a capture starts', async () => {
        const { store, tour } = mountTour()

        tour.start()
        await nextTick()
        expect(tour.active).toBe(true)

        store.capturing = true
        await nextTick()

        expect(tour.active).toBe(false)
    })

    it('ends the tour when a non-pin capture mode opens', async () => {
        const { store, tour } = mountTour()

        tour.start()
        await nextTick()
        store.mode = 'annotation'
        await nextTick()

        expect(tour.active).toBe(false)
    })

    it('swaps the pin bridge for the report-form steps once the panel is open', async () => {
        const { store, tour } = mountTour()

        tour.start()
        await nextTick()
        tour.next()
        tour.next()
        tour.next()
        await nextTick()
        expect(cardText()).toContain('Create your first report')

        store.report.pending = { pin: { x: 10, y: 10 } }
        await nextTick()

        expect(cardText()).toContain('4 of 5')
        expect(cardText()).toContain('Describe the issue')

        await buttonWithLabel('Next').trigger('click')
        expect(cardText()).toContain('Send it')
        expect(buttonWithLabel('Done')).toBeDefined()
    })

    it('ends the tour when submitting shortens the list past the current step', async () => {
        const { store, tour } = mountTour()

        store.report.pending = { pin: { x: 10, y: 10 } }
        await nextTick()
        tour.start()
        await nextTick()
        tour.next()
        tour.next()
        tour.next()
        tour.next()
        await nextTick()
        expect(cardText()).toContain('5 of 5')
        expect(cardText()).toContain('Send it')

        // Submitting the draft clears the pending pin, so the form steps disappear and
        // there is no honest step left to show (the pin step would contradict the submit).
        store.report.pending = null
        await nextTick()

        expect(tour.active).toBe(false)
        expect(store.settings.expanded).toBe(false)
        expect(wrapper!.find('[data-component="walkthrough-card"]').exists()).toBe(false)
    })

    it('lets the user collapse the toolbar mid-tour without re-expanding it', async () => {
        const { store, tour } = mountTour()

        store.settings.expanded = true
        tour.start()
        await nextTick()
        expect(store.settings.expanded).toBe(true)

        store.settings.expanded = false
        await nextTick()

        expect(tour.active).toBe(false)
        expect(store.settings.expanded).toBe(false)
    })

    it('ends the tour on logout', async () => {
        const { store, tour } = mountTour()

        tour.start()
        await nextTick()
        store.auth.user = null
        await nextTick()

        expect(tour.active).toBe(false)
        expect(store.settings.expanded).toBe(false)
    })
})
