// Pin geometry — pure math (no DOM). The DOM-reading orchestrator that resolves a
// selector and reads scroll/rect dimensions lives in core/pin.ts and delegates here,
// so all three former copies of this math (utils, core/Report, core/PinCapture) share
// one tested implementation.

export interface PinCoordinates {
    pageX: number
    pageY: number
}

type Rect = { left: number; top: number; width: number; height: number }

/** Pin percentage → absolute page pixels, against the full scroll dimensions. */
export function pinToPagePixels(pin: { x: number; y: number }, scrollW: number, scrollH: number): PinCoordinates {
    return {
        pageX: (pin.x / 100) * scrollW,
        pageY: (pin.y / 100) * scrollH,
    }
}

/** Pin percentage → absolute page pixels, relative to an element's rect (offset into page space). */
export function pinToElementPixels(pin: { x: number; y: number }, rect: Rect, scrollX: number, scrollY: number): PinCoordinates {
    return {
        pageX: rect.left + (pin.x / 100) * rect.width + scrollX,
        pageY: rect.top + (pin.y / 100) * rect.height + scrollY,
    }
}

/** Inverse: absolute page pixels → pin percentage of the scroll dimensions. */
export function pagePixelsToPin(pageX: number, pageY: number, scrollW: number, scrollH: number): { x: number; y: number } {
    return {
        x: scrollW > 0 ? (pageX / scrollW) * 100 : 0,
        y: scrollH > 0 ? (pageY / scrollH) * 100 : 0,
    }
}

/** Inverse of pinToElementPixels: page pixels → element-relative pin percentage. */
export function elementPixelsToPin(pageX: number, pageY: number, rect: Rect, scrollX: number, scrollY: number): { x: number; y: number } {
    return {
        x: rect.width > 0 ? ((pageX - scrollX - rect.left) / rect.width) * 100 : 0,
        y: rect.height > 0 ? ((pageY - scrollY - rect.top) / rect.height) * 100 : 0,
    }
}

/** Viewport pixels → page pixels (add the scroll offset). */
export function viewportToPage(viewportX: number, viewportY: number, scrollX: number, scrollY: number): PinCoordinates {
    return {
        pageX: viewportX + scrollX,
        pageY: viewportY + scrollY,
    }
}

/** Page pixels → viewport pixels (subtract the scroll offset). */
export function pageToViewport(pageX: number, pageY: number, scrollX: number, scrollY: number): { viewportX: number; viewportY: number } {
    return {
        viewportX: pageX - scrollX,
        viewportY: pageY - scrollY,
    }
}

// Converts an array of [x, y] points to a smooth SVG path string using Catmull-Rom splines.
// tension controls how tightly the curve follows the control points (0.5 is standard).
export function smoothPath(points: [number, number][], tension = 0.5): string {
    if (points.length < 2) return ''
    if (points.length === 2) {
        return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
    }

    const d = [`M ${points[0][0]} ${points[0][1]}`]

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)]
        const p1 = points[i]
        const p2 = points[i + 1]
        const p3 = points[Math.min(i + 2, points.length - 1)]

        const cp1x = p1[0] + (p2[0] - p0[0]) * tension / 3
        const cp1y = p1[1] + (p2[1] - p0[1]) * tension / 3
        const cp2x = p2[0] - (p3[0] - p1[0]) * tension / 3
        const cp2y = p2[1] - (p3[1] - p1[1]) * tension / 3

        d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`)
    }

    return d.join(' ')
}
