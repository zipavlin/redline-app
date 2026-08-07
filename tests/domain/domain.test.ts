import { describe, expect, it } from 'vitest'
import {
    smoothPath,
    pinToPagePixels,
    pinToElementPixels,
    pagePixelsToPin,
    elementPixelsToPin,
    viewportToPage,
    pageToViewport,
} from '@/domain/pin'
import { roleFlags } from '@/domain/role'

describe('roleFlags', () => {
    it('marks developer and admin as isDeveloper; only admin as isAdmin', () => {
        expect(roleFlags('reporter')).toEqual({ isDeveloper: false, isAdmin: false })
        expect(roleFlags('developer')).toEqual({ isDeveloper: true, isAdmin: false })
        expect(roleFlags('admin')).toEqual({ isDeveloper: true, isAdmin: true })
    })
})

describe('pin geometry', () => {
    const rect = { left: 50, top: 40, width: 200, height: 100 }

    it('round-trips page pins through pinToPagePixels / pagePixelsToPin', () => {
        const pin = { x: 25, y: 75 }
        const { pageX, pageY } = pinToPagePixels(pin, 800, 600)
        expect(pagePixelsToPin(pageX, pageY, 800, 600)).toEqual(pin)
    })

    it('round-trips element pins through pinToElementPixels / elementPixelsToPin with scroll', () => {
        const pin = { x: 30, y: 60 }
        const { pageX, pageY } = pinToElementPixels(pin, rect, 120, 80)
        expect(elementPixelsToPin(pageX, pageY, rect, 120, 80)).toEqual(pin)
    })

    it('elementPixelsToPin treats viewport-space clicks as element-relative with zero scroll', () => {
        // getBoundingClientRect is viewport-relative; capture math passes scroll 0.
        expect(elementPixelsToPin(150, 90, rect, 0, 0)).toEqual({ x: 50, y: 50 })
    })

    it('round-trips viewport coordinates through viewportToPage / pageToViewport', () => {
        const { pageX, pageY } = viewportToPage(320, 240, 100, 50)
        expect(pageToViewport(pageX, pageY, 100, 50)).toEqual({ viewportX: 320, viewportY: 240 })
    })

    it('pagePixelsToPin returns 0 for a zero-width or zero-height scroll area', () => {
        expect(pagePixelsToPin(100, 100, 0, 0)).toEqual({ x: 0, y: 0 })
        expect(pagePixelsToPin(100, 100, 0, 400)).toEqual({ x: 0, y: 25 })
        expect(pagePixelsToPin(100, 100, 800, 0)).toEqual({ x: 12.5, y: 0 })
    })

    it('elementPixelsToPin returns 0 for a zero-width or zero-height element rect', () => {
        const empty = { left: 0, top: 0, width: 0, height: 0 }
        expect(elementPixelsToPin(5, 5, empty, 0, 0)).toEqual({ x: 0, y: 0 })
        const noWidth = { left: 10, top: 10, width: 0, height: 50 }
        expect(elementPixelsToPin(20, 35, noWidth, 0, 0)).toEqual({ x: 0, y: 50 })
    })

    it('does not clamp valid percentages outside 0-100', () => {
        const { pageX, pageY } = pinToPagePixels({ x: 150, y: -25 }, 800, 600)
        expect(pageX).toBe(1200)
        expect(pageY).toBe(-150)
        expect(pagePixelsToPin(1200, -150, 800, 600)).toEqual({ x: 150, y: -25 })
    })

    it('forward helpers stay finite with zero dimensions', () => {
        expect(pinToPagePixels({ x: 50, y: 50 }, 0, 0)).toEqual({ pageX: 0, pageY: 0 })
        const zero = { left: 0, top: 0, width: 0, height: 0 }
        expect(pinToElementPixels({ x: 50, y: 50 }, zero, 10, 20)).toEqual({ pageX: 10, pageY: 20 })
    })
})

describe('smoothPath', () => {
    it('returns empty for fewer than two points', () => {
        expect(smoothPath([])).toBe('')
        expect(smoothPath([[0, 0]])).toBe('')
    })
    it('draws a straight line for exactly two points', () => {
        expect(smoothPath([[0, 0], [10, 10]])).toBe('M 0 0 L 10 10')
    })
    it('emits cubic bezier segments for three or more points', () => {
        const d = smoothPath([[0, 0], [10, 10], [20, 0]])
        expect(d.startsWith('M 0 0')).toBe(true)
        expect(d).toContain('C ')
    })
    it('handles many points without error and preserves the start', () => {
        const points: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 10, i % 2 === 0 ? 0 : 20] as [number, number])
        const d = smoothPath(points)
        expect(d.startsWith('M 0 0')).toBe(true)
        expect(d.split('C ').length).toBe(points.length)
    })
})
