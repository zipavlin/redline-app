/**
 * Shared UPopover anchoring for pin-attached panels (report view + new-report
 * composer). Both build a "virtual element" (a `{ getBoundingClientRect }`) from a
 * pin's page coordinates and pick which side to open toward - this centralises the
 * DOMRect construction and the element-or-virtual fallback so the callers only supply
 * their own coordinate/side logic.
 *
 * On narrow (mobile) viewports the caller's side heuristic is overridden to `'bottom'`
 * so the popover opens BELOW the pin instead of left/right of it (which would push it
 * off-screen). The override is reactive: rotating/resizing across the 640px breakpoint
 * re-places an open popover live.
 */
import { computed, onScopeDispose, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'

/** Minimal shape UPopover accepts as a `reference`. */
export interface VirtualElement {
    getBoundingClientRect: () => DOMRect
}

/** Side a pin-anchored popover can open toward. `'bottom'` is forced on mobile. */
export type PinAnchorSide = 'left' | 'right' | 'bottom'

/** Tailwind `sm:` breakpoint - below this the widget treats the viewport as mobile. */
const MOBILE_QUERY = '(max-width: 640px)'

/** A zero-size DOMRect at a single viewport point. */
function pointRect(x: number, y: number): DOMRect {
    return { x, y, top: y, left: x, right: x, bottom: y, width: 0, height: 0, toJSON() {} } as DOMRect
}

/** Virtual anchor element positioned at page-pixel coords (converted to viewport). */
export function virtualPageAnchor(pageX: number, pageY: number): VirtualElement {
    return { getBoundingClientRect: () => pointRect(pageX - window.scrollX, pageY - window.scrollY) }
}

/**
 * Reactive `matchMedia('(max-width: 640px)')` match, updated live via a `change`
 * listener (cleaned up on scope dispose). Self-contained - no store/core imports, so
 * `composables/` stays a leaf for the dependency-cruiser layering rules.
 */
function createIsMobile(): Ref<boolean> {
    const isMobile = ref(false)
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const mql = window.matchMedia(MOBILE_QUERY)
        isMobile.value = mql.matches
        const onChange = (event: MediaQueryListEvent) => {
            isMobile.value = event.matches
        }
        mql.addEventListener('change', onChange)
        onScopeDispose(() => mql.removeEventListener('change', onChange))
    }
    return isMobile
}

export interface PinAnchorOptions {
    /** Real DOM element to anchor to (e.g. the pin marker). Wins when present. */
    element?: MaybeRefOrGetter<Element | null | undefined>
    /** Page-pixel coordinates for a virtual anchor when no element is given. */
    coords?: MaybeRefOrGetter<{ pageX: number; pageY: number } | null | undefined>
    /** Side the popover opens toward - overridden to `'bottom'` on mobile. */
    side?: MaybeRefOrGetter<PinAnchorSide>
}

/**
 * Returns `{ reference, side }` computeds for a pin-anchored UPopover.
 * `reference` prefers a real `element`, else a virtual anchor from `coords`, else
 * `undefined` (popover falls back to its default anchor).
 * `side` is the caller's heuristic on desktop, forced to `'bottom'` on mobile so the
 * popover opens below the pin and stays on-screen.
 */
export function usePinAnchor(options: PinAnchorOptions) {
    const reference = computed<Element | VirtualElement | undefined>(() => {
        const el = toValue(options.element)
        if (el instanceof Element) return el
        const c = toValue(options.coords)
        return c ? virtualPageAnchor(c.pageX, c.pageY) : undefined
    })

    const isMobile = createIsMobile()

    const side = computed<PinAnchorSide>(() => (isMobile.value ? 'bottom' : (toValue(options.side) ?? 'left')))

    return { reference, side }
}
