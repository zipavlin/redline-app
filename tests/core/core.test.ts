import { describe, expect, it } from 'vitest'
import { getCleanUrl, getUrlKey } from '@/core/url'
import { getPinCoordinates } from '@/core/pin'

describe('URL keys', () => {
    it('getUrlKey drops redline + tracking params and sorts the rest', () => {
        window.location.href = 'http://localhost/dash?utm_source=x&redline-report=1&b=2&a=1'
        expect(getUrlKey()).toBe('/dash?a=1&b=2')
    })
    it('getCleanUrl keeps content params but drops redline params and hash', () => {
        window.location.href = 'http://localhost/dash?keep=1&redline-report=9#frag'
        expect(getCleanUrl()).toBe('http://localhost/dash?keep=1')
    })
})

describe('getPinCoordinates', () => {
    it('returns null when the report has no pin', () => {
        expect(getPinCoordinates({ pin: null })).toBeNull()
    })
    it('computes page pixels from scroll-dimension percentages', () => {
        // Stub the document scroll size so the percentage math is deterministic.
        Object.defineProperty(document.documentElement, 'scrollWidth', { value: 1000, configurable: true })
        Object.defineProperty(document.documentElement, 'scrollHeight', { value: 500, configurable: true })

        expect(getPinCoordinates({ pin: { x: 50, y: 20 } })).toEqual({ pageX: 500, pageY: 100 })
    })
})
