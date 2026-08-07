/**
 * Pin coordinate resolution - the DOM-reading orchestrator over the pure math in
 * domain/pin.ts. Reads the live DOM (selector resolution, element rect, scroll
 * dimensions), so it lives in core/.
 */
import { resolveSelector } from '@/core/selector'
import { pinToElementPixels, pinToPagePixels, type PinCoordinates } from '@/domain/pin'

export interface Pin {
    x: number
    y: number
    prefer_selector?: boolean
    scroll_x?: number
    scroll_y?: number
}

/**
 * Returns absolute page-pixel {pageX, pageY} for a report's pin.
 * If pin.prefer_selector, resolves the element and uses element-relative percentages;
 * otherwise treats pin.x/y as percentages of the full scroll dimensions.
 */
export function getPinCoordinates(report: { pin: Pin | null; element?: string | Element | null }): PinCoordinates | null {
    const pin = report.pin
    if (!pin) return null

    if (pin.prefer_selector && typeof report.element === 'string' && report.element) {
        const el = resolveSelector(report.element)
        if (el) {
            return pinToElementPixels(pin, el.getBoundingClientRect(), window.scrollX, window.scrollY)
        }
    }

    return pinToPagePixels(pin, document.documentElement.scrollWidth, document.documentElement.scrollHeight)
}
