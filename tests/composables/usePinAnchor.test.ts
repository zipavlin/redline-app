import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { usePinAnchor, type PinAnchorSide } from '@/composables/usePinAnchor'

/**
 * Controllable matchMedia mock: a fake MediaQueryList whose `matches` we flip and
 * whose `change` listeners we notify, so the composable's reactive override can be
 * exercised (happy-dom's real matchMedia does not track window size changes).
 */
function createMatchMediaMock(initialMatches = false) {
    let matches = initialMatches
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const mql = {
        get matches() {
            return matches
        },
        media: '(max-width: 640px)',
        onchange: null,
        dispatchEvent: vi.fn(() => false),
        addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener)
        }),
        removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener)
        }),
        addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener)
        }),
        removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener)
        }),
        /** Flip `matches` and notify every registered `change` listener (simulated resize/rotate). */
        setMatches(next: boolean) {
            matches = next
            const event = { matches: next, media: mql.media } as MediaQueryListEvent
            listeners.forEach((listener) => listener(event))
        },
    }
    return { mql, setMatches: (next: boolean) => mql.setMatches(next) }
}

type MatchMediaMock = ReturnType<typeof createMatchMediaMock>

function installMatchMedia(mock: MatchMediaMock) {
    window.matchMedia = vi.fn((query: string) => {
        expect(query).toBe('(max-width: 640px)')
        return mock.mql as unknown as MediaQueryList
    })
}

const originalMatchMedia = window.matchMedia
afterEach(() => {
    window.matchMedia = originalMatchMedia
})

/** Mounts a harness so usePinAnchor runs inside a component effect scope (onScopeDispose works). */
function setupHarness(side: () => PinAnchorSide, mock: MatchMediaMock) {
    installMatchMedia(mock)
    const Harness = defineComponent({
        setup() {
            const anchor = usePinAnchor({ side })
            return { anchor }
        },
        template: '<div />',
    })
    const wrapper = mount(Harness)
    const anchor = () => (wrapper.vm as unknown as { anchor: ReturnType<typeof usePinAnchor> }).anchor
    return { wrapper, anchor }
}

describe('usePinAnchor', () => {
    it('desktop preserves the caller side heuristic', () => {
        const mock = createMatchMediaMock(false)
        const { anchor } = setupHarness(() => 'right', mock)
        expect(anchor().side.value).toBe('right')
    })

    it('desktop defaults to left when no side heuristic is given', () => {
        const mock = createMatchMediaMock(false)
        installMatchMedia(mock)
        const Harness = defineComponent({
            setup() {
                return { anchor: usePinAnchor({}) }
            },
            template: '<div />',
        })
        const wrapper = mount(Harness)
        expect((wrapper.vm as unknown as { anchor: ReturnType<typeof usePinAnchor> }).anchor.side.value).toBe('left')
    })

    it('mobile forces bottom regardless of the caller heuristic', () => {
        const mock = createMatchMediaMock(true)
        const { anchor } = setupHarness(() => 'right', mock)
        expect(anchor().side.value).toBe('bottom')
    })

    it('mobile forces bottom even when the caller would pick left', () => {
        const mock = createMatchMediaMock(true)
        const { anchor } = setupHarness(() => 'left', mock)
        expect(anchor().side.value).toBe('bottom')
    })

    it('flips reactively when the viewport crosses the mobile breakpoint', () => {
        const mock = createMatchMediaMock(false)
        const { anchor } = setupHarness(() => 'right', mock)
        expect(anchor().side.value).toBe('right')

        // Resize into mobile → opens below the pin instead.
        mock.setMatches(true)
        expect(anchor().side.value).toBe('bottom')

        // Rotate/resize back to desktop → caller heuristic returns.
        mock.setMatches(false)
        expect(anchor().side.value).toBe('right')
    })

    it('removes the media query listener on unmount', () => {
        const mock = createMatchMediaMock(false)
        const { wrapper } = setupHarness(() => 'left', mock)
        expect(mock.mql.addEventListener).toHaveBeenCalledTimes(1)
        expect(mock.mql.removeEventListener).not.toHaveBeenCalled()

        wrapper.unmount()
        expect(mock.mql.removeEventListener).toHaveBeenCalledTimes(1)
    })
})
