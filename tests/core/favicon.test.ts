import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyDashboardFavicon } from '@/core/favicon'

/**
 * happy-dom has no real canvas and never fires natural image onload, so the
 * canvas element, the 2d context and Image are all stubbed. fetch is mocked per
 * test. The applied <link rel="icon"> in <head> is the observable outcome.
 */

/** Flushes the microtask chain (all mocked promises resolve in microtasks). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const BASE = 'http://localhost:3000/'

/**
 * Image stub: captures src/crossOrigin and settles synchronously via a
 * test-controllable hook (static flags).
 */
class FakeImage {
    static instances: FakeImage[] = []
    static errorWithCrossOrigin = false
    static errorAlways = false

    private _src = ''
    crossOrigin: string | null = null
    decoding = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    constructor() {
        FakeImage.instances.push(this)
    }

    get src(): string {
        return this._src
    }

    set src(value: string) {
        this._src = value
        const shouldError = FakeImage.errorAlways || (FakeImage.errorWithCrossOrigin && this.crossOrigin !== null)
        if (shouldError) this.onerror?.()
        else this.onload?.()
    }
}

function createCanvasStub(): {
    canvas: HTMLCanvasElement
    ctx: Record<string, unknown>
    toDataURL: ReturnType<typeof vi.fn>
    getContext: ReturnType<typeof vi.fn>
} {
    const ctx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        clip: vi.fn(),
        roundRect: vi.fn(),
        drawImage: vi.fn(),
        closePath: vi.fn(),
        arcTo: vi.fn(),
        arc: vi.fn(),
    }
    const toDataURL = vi.fn(() => 'data:image/png;base64,FAKE')
    const getContext = vi.fn((kind: string) => (kind === '2d' ? ctx : null))
    const canvas = {
        width: 0,
        height: 0,
        getContext,
        // toDataURL lives on the canvas ELEMENT (like a real browser), not the context.
        toDataURL,
    }
    return { canvas: canvas as unknown as HTMLCanvasElement, ctx, toDataURL, getContext }
}

let fetchMock: ReturnType<typeof vi.fn>
let canvasStub: ReturnType<typeof createCanvasStub>

const originalCreateElement = document.createElement.bind(document)

beforeEach(() => {
    localStorage.clear()
    FakeImage.instances = []
    FakeImage.errorWithCrossOrigin = false
    FakeImage.errorAlways = false

    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Image', FakeImage)

    canvasStub = createCanvasStub()
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'canvas') return canvasStub.canvas
        return originalCreateElement(tagName)
    })

    // Deterministic base URI regardless of happy-dom's navigation semantics.
    Object.defineProperty(document, 'baseURI', { configurable: true, value: BASE })
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.head.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove())
})

function appliedLink(): HTMLLinkElement | null {
    return document.head.querySelector('link[rel~="icon"]')
}

function appliedHref(): string | null {
    return appliedLink()?.getAttribute('href') ?? null
}

/** Every fetch 404s — no icon can be discovered anywhere. */
function mockNoFavicons(): void {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
}

/** /favicon.ico answers HEAD with an image content type; everything else 404s. */
function mockFaviconIco(): void {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        if (String(url).endsWith('/favicon.ico') && init?.method === 'HEAD') {
            return Promise.resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/x-icon' } }))
        }
        return Promise.resolve(new Response(null, { status: 404 }))
    })
}

/** Root page serves HTML; /favicon.ico 404s. */
function mockRootPage(html: string): void {
    fetchMock.mockImplementation((url: string) => {
        if (String(url) === BASE) {
            return Promise.resolve(new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }))
        }
        return Promise.resolve(new Response(null, { status: 404 }))
    })
}

describe('applyDashboardFavicon', () => {
    it('applies a cached favicon immediately without any network call', async () => {
        localStorage.setItem('redline_favicon', 'data:image/png;base64,CACHED')

        applyDashboardFavicon()
        await flush()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(appliedHref()).toBe('data:image/png;base64,CACHED')
    })

    it('treats an empty cached string as a cache miss and rediscovers the icon', async () => {
        localStorage.setItem('redline_favicon', '')
        mockFaviconIco()

        applyDashboardFavicon()
        await flush()

        expect(fetchMock).toHaveBeenCalled()
        expect(FakeImage.instances[0]?.src).toBe(`${BASE}favicon.ico`)
        expect(appliedHref()).toBe('data:image/png;base64,FAKE')
    })

    it('treats a throwing localStorage read as a cache miss without throwing', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage denied')
        })
        mockNoFavicons()

        applyDashboardFavicon()
        await flush()

        expect(appliedLink()).toBeNull()
    })

    it('falls back to /favicon.ico via HEAD when the root page yields no icon', async () => {
        mockFaviconIco()

        applyDashboardFavicon()
        await flush()

        expect(fetchMock).toHaveBeenCalledWith(BASE)
        expect(fetchMock).toHaveBeenCalledWith(`${BASE}favicon.ico`, { method: 'HEAD' })
        expect(FakeImage.instances[0]?.src).toBe(`${BASE}favicon.ico`)
        expect(appliedLink()).not.toBeNull()
    })

    it('falls back to GET when the /favicon.ico HEAD probe fails', async () => {
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
            if (String(url) === BASE) {
                return Promise.resolve(new Response('<html><head><title>Home</title></head></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
            }
            if (String(url).endsWith('/favicon.ico') && init?.method === 'HEAD') {
                return Promise.resolve(new Response(null, { status: 404 }))
            }
            if (String(url).endsWith('/favicon.ico') && init?.method === 'GET') {
                return Promise.resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/png' } }))
            }
            return Promise.resolve(new Response(null, { status: 404 }))
        })

        applyDashboardFavicon()
        await flush()

        expect(fetchMock).toHaveBeenCalledWith(BASE)
        expect(fetchMock).toHaveBeenCalledWith(`${BASE}favicon.ico`, { method: 'HEAD' })
        expect(fetchMock).toHaveBeenCalledWith(`${BASE}favicon.ico`, { method: 'GET' })
        expect(FakeImage.instances[0]?.src).toBe(`${BASE}favicon.ico`)
        expect(appliedLink()).not.toBeNull()
    })

    it('parses the root page and picks rel="icon" from it', async () => {
        mockRootPage('<html><head><link rel="icon" href="/static/icon.png"></head></html>')

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances[0]?.src).toBe(`${BASE}static/icon.png`)
        expect(appliedLink()).not.toBeNull()
    })

    it('prefers the root-page <link rel="icon"> and never probes /favicon.ico', async () => {
        fetchMock.mockImplementation((url: string) => {
            if (String(url) === BASE) {
                return Promise.resolve(new Response('<html><head><link rel="icon" href="/static/icon.png"></head></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
            }
            if (String(url).endsWith('/favicon.ico')) {
                // /favicon.ico exists too — but must NOT be probed while the root page declares an icon.
                return Promise.resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/x-icon' } }))
            }
            return Promise.resolve(new Response(null, { status: 404 }))
        })

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances[0]?.src).toBe(`${BASE}static/icon.png`)
        expect(appliedLink()).not.toBeNull()
        expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/favicon.ico'))).toHaveLength(0)
    })

    it('probes /favicon.ico via HEAD when the root page declares no icon links', async () => {
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
            if (String(url) === BASE) {
                return Promise.resolve(new Response('<html><head><title>Home</title></head></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
            }
            if (String(url).endsWith('/favicon.ico') && init?.method === 'HEAD') {
                return Promise.resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/x-icon' } }))
            }
            return Promise.resolve(new Response(null, { status: 404 }))
        })

        applyDashboardFavicon()
        await flush()

        expect(fetchMock).toHaveBeenCalledWith(BASE)
        expect(fetchMock).toHaveBeenCalledWith(`${BASE}favicon.ico`, { method: 'HEAD' })
        expect(FakeImage.instances[0]?.src).toBe(`${BASE}favicon.ico`)
        expect(appliedLink()).not.toBeNull()
    })

    it('prefers an SVG / sizes="any" icon over a smaller PNG', async () => {
        mockRootPage(
            '<html><head>' +
                '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">' +
                '<link rel="icon" type="image/svg+xml" href="/favicon.svg">' +
                '</head></html>',
        )

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances[0]?.src).toBe(`${BASE}favicon.svg`)
    })

    it('picks the largest declared sizes when no SVG is present', async () => {
        mockRootPage(
            '<html><head>' +
                '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">' +
                '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">' +
                '</head></html>',
        )

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances[0]?.src).toBe(`${BASE}favicon-32.png`)
    })

    it('falls back to apple-touch-icon when no plain icon link exists', async () => {
        mockRootPage('<html><head><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"></head></html>')

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances[0]?.src).toBe(`${BASE}apple-touch-icon.png`)
    })

    it('resolves a relative href against document.baseURI', async () => {
        mockRootPage('<html><head><link rel="icon" href="assets/favicon.svg"></head></html>')

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances[0]?.src).toBe(`${BASE}assets/favicon.svg`)
    })

    it('sets crossOrigin="anonymous" for a cross-origin source', async () => {
        mockRootPage('<html><head><link rel="icon" href="https://cdn.example.com/favicon.ico"></head></html>')

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances[0]?.crossOrigin).toBe('anonymous')
        expect(FakeImage.instances[0]?.src).toBe('https://cdn.example.com/favicon.ico')
    })

    it('falls back to the raw host URL when toDataURL throws (tainted canvas)', async () => {
        mockFaviconIco()
        canvasStub.toDataURL.mockImplementation(() => {
            throw new Error('tainted canvas')
        })

        applyDashboardFavicon()
        await flush()

        expect(appliedHref()).toBe(`${BASE}favicon.ico`)
        expect(localStorage.getItem('redline_favicon')).toBeNull()
    })

    it('falls back to the raw URL when no 2d canvas context is available', async () => {
        mockFaviconIco()
        canvasStub.getContext.mockReturnValue(null)

        applyDashboardFavicon()
        await flush()

        expect(appliedHref()).toBe(`${BASE}favicon.ico`)
        expect(localStorage.getItem('redline_favicon')).toBeNull()
    })

    it('retries a failed cross-origin load without crossOrigin and applies the raw URL', async () => {
        mockRootPage('<html><head><link rel="icon" href="https://cdn.example.com/favicon.ico"></head></html>')
        FakeImage.errorWithCrossOrigin = true
        canvasStub.toDataURL.mockImplementation(() => {
            throw new Error('tainted canvas')
        })

        applyDashboardFavicon()
        await flush()

        expect(FakeImage.instances).toHaveLength(2)
        expect(FakeImage.instances[0]?.crossOrigin).toBe('anonymous')
        expect(FakeImage.instances[1]?.crossOrigin).toBeNull()
        expect(appliedHref()).toBe('https://cdn.example.com/favicon.ico')
        expect(localStorage.getItem('redline_favicon')).toBeNull()
    })

    it('creates no link and throws nothing when no favicon can be discovered', async () => {
        mockNoFavicons()

        applyDashboardFavicon()
        await flush()

        expect(appliedLink()).toBeNull()
    })

    it('draws the 24×24 frame and the squiggle baseline at the bottom', async () => {
        mockFaviconIco()

        applyDashboardFavicon()
        await flush()

        // Frame: single 24×24 at (4,4), 3px radius (IMAGE = {x:4, y:4, size:24, radius:3}).
        expect(canvasStub.ctx.roundRect).toHaveBeenCalledTimes(1)
        expect(canvasStub.ctx.roundRect).toHaveBeenCalledWith(4, 4, 24, 24, 3)
        // Squiggle baseline 28.8 (cx=16, width=26 → x0=3), hugging the canvas bottom.
        expect(canvasStub.ctx.moveTo).toHaveBeenCalledWith(3, 28.8)
    })

    it('still applies the favicon when localStorage.setItem throws', async () => {
        mockFaviconIco()
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded')
        })

        applyDashboardFavicon()
        await flush()

        expect(appliedHref()).toBe('data:image/png;base64,FAKE')
    })
})
