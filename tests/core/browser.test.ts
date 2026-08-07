import { afterEach, describe, expect, it, vi } from 'vitest'
import { canCapture, getBrowserDetails, getBrowserInfo } from '@/core/browser'

const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.76'
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
const FIREFOX_UA = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0'
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
const SAFARI_IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
const CHROMIUM_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/118.0.0.0 Safari/537.36'
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'

function stubNavigator(userAgent: string) {
    vi.stubGlobal('navigator', { userAgent })
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as unknown as Record<string, unknown>).innerWidth
    delete (window as unknown as Record<string, unknown>).innerHeight
    delete (window as unknown as Record<string, unknown>).devicePixelRatio
})

describe('getBrowserDetails', () => {
    it('detects Edge before Chrome (Edg/ marker)', () => {
        stubNavigator(EDGE_UA)
        expect(getBrowserDetails()).toEqual({ name: 'Edge', version: '118', os: 'Windows' })
    })

    it('detects Chrome', () => {
        stubNavigator(CHROME_UA)
        expect(getBrowserDetails()).toEqual({ name: 'Chrome', version: '121', os: 'macOS' })
    })

    it('detects Firefox', () => {
        stubNavigator(FIREFOX_UA)
        expect(getBrowserDetails()).toEqual({ name: 'Firefox', version: '122', os: 'Linux' })
    })

    it('detects Safari only when Chrome is absent', () => {
        stubNavigator(SAFARI_UA)
        expect(getBrowserDetails()).toEqual({ name: 'Safari', version: '17', os: 'macOS' })
    })

    it('detects iOS-safari user agents as Safari (PINS: macOS wins on OS sniff)', () => {
        /**
         * The UA contains "like Mac OS X", and the macOS check precedes the
         * iOS check - so the OS is reported as macOS even for an iPhone UA.
         */
        stubNavigator(SAFARI_IOS_UA)
        expect(getBrowserDetails()).toEqual({ name: 'Safari', version: '17', os: 'macOS' })
    })

    it('detects Android', () => {
        stubNavigator(ANDROID_CHROME_UA)
        expect(getBrowserDetails()).toEqual({ name: 'Chrome', version: '121', os: 'Android' })
    })

    it('does not report plain Chromium as Chrome or Safari', () => {
        stubNavigator(CHROMIUM_UA)
        expect(getBrowserDetails()).toEqual({ name: 'Unknown', version: '', os: 'Linux' })
    })

    it('returns Unknown for an unrecognized user agent', () => {
        stubNavigator('Totally unknown agent string')
        expect(getBrowserDetails()).toEqual({ name: 'Unknown', version: '', os: 'Unknown' })
    })
})

describe('getBrowserInfo', () => {
    it('combines browser details with viewport and DPR', () => {
        stubNavigator(EDGE_UA)
        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
        Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true })
        Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })

        expect(getBrowserInfo()).toEqual({
            name: 'Edge',
            version: '118',
            os: 'Windows',
            viewport_width: 1280,
            viewport_height: 720,
            device_pixel_ratio: 2,
            user_agent: EDGE_UA,
        })
    })
})

describe('canCapture', () => {
    it('returns false when mediaDevices is missing', () => {
        vi.stubGlobal('navigator', { userAgent: '' })
        expect(canCapture()).toBe(false)
    })

    it('returns false when getDisplayMedia is missing', () => {
        vi.stubGlobal('navigator', { mediaDevices: {} })
        expect(canCapture()).toBe(false)
    })

    it('returns true when getDisplayMedia is available', () => {
        vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn() } })
        expect(canCapture()).toBe(true)
    })
})
