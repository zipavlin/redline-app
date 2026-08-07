import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenshotCapture } from '@/core/capture/screenshot'

const snapdomMock = vi.hoisted(() => ({ snapdom: vi.fn() }))
vi.mock('@zumer/snapdom', () => snapdomMock)

interface Ctx {
    fillStyle: string
    fillRect: ReturnType<typeof vi.fn>
    drawImage: ReturnType<typeof vi.fn>
}

let ctx: Ctx

/** happy-dom has no canvas 2D context - install the Object.defineProperty stub. */
function stubCanvas() {
    ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: vi.fn(() => ctx),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
        configurable: true,
        value: vi.fn(() => 'data:image/png;base64,AAAA'),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        value: vi.fn((cb: BlobCallback) => cb(new Blob(['x'], { type: 'image/png' }))),
    })
}

function stubScroll(width: number, height: number) {
    Object.defineProperty(document.documentElement, 'scrollWidth', { value: width, configurable: true })
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: height, configurable: true })
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    delete (document.documentElement as unknown as Record<string, unknown>).scrollWidth
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toDataURL
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toBlob
    document.body.innerHTML = ''
})

describe('ScreenshotCapture', () => {
    it('rejects getBlob() before any capture', async () => {
        const cap = new ScreenshotCapture()
        await expect(cap.getBlob()).rejects.toThrow('crop() must be called first')
        expect(cap.getThumbnailUrl()).toBeNull()
        expect(cap.fullCanvas).toBeNull()
        expect(cap.croppedCanvas).toBeNull()
    })

    it('captures the full scroll dimensions through snapdom + canvas', async () => {
        stubCanvas()
        stubScroll(800, 600)
        const fakeImg = {}
        snapdomMock.snapdom.mockResolvedValue({ toSvg: async () => fakeImg })

        const cap = new ScreenshotCapture()
        const canvas = await cap.capture()

        expect(canvas.width).toBe(800)
        expect(canvas.height).toBe(600)
        expect(snapdomMock.snapdom).toHaveBeenCalledWith(document.body, expect.objectContaining({
            scale: 1, width: 800, height: 600, embedFonts: false, filterMode: 'remove',
        }))
        expect(ctx.fillStyle).toBe('#ffffff')
        expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600)
        expect(ctx.drawImage).toHaveBeenCalledWith(fakeImg, 0, 0, 800, 600)
        expect(cap.fullCanvas).toBe(canvas)
        expect(cap.croppedCanvas).toBe(canvas)
        expect(cap.getThumbnailUrl()).toBe('data:image/png;base64,AAAA')
    })

    it('passes a filter that excludes redline overlay ids', async () => {
        stubCanvas()
        stubScroll(100, 100)
        snapdomMock.snapdom.mockResolvedValue({ toSvg: async () => ({}) })

        const excluded = document.createElement('div')
        excluded.id = 'redline-host'
        const normal = document.createElement('div')
        normal.id = 'keep-me'

        await new ScreenshotCapture().capture()

        const filter = snapdomMock.snapdom.mock.calls[0][1].filter
        expect(filter(excluded)).toBe(false)
        expect(filter(normal)).toBe(true)
    })

    it('captures an element rect through snapdom for non-img elements', async () => {
        stubCanvas()
        const el = document.createElement('section')
        Object.defineProperty(el, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ width: 300, height: 200, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }),
        })
        const fakeImg = {}
        snapdomMock.snapdom.mockResolvedValue({ toSvg: async () => fakeImg })

        const cap = new ScreenshotCapture()
        await cap.captureElement(el)

        const canvas = cap.fullCanvas!
        expect(canvas.width).toBe(300)
        expect(canvas.height).toBe(200)
        expect(snapdomMock.snapdom).toHaveBeenCalledWith(el, expect.objectContaining({ scale: 1, embedFonts: false }))
        expect(ctx.drawImage).toHaveBeenCalledWith(fakeImg, 0, 0, 300, 200)
    })

    it('draws <img> elements directly without snapdom', async () => {
        stubCanvas()
        const img = document.createElement('img')
        Object.defineProperty(img, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ width: 120, height: 80, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) }),
        })

        const cap = new ScreenshotCapture()
        await cap.captureElement(img)

        expect(snapdomMock.snapdom).not.toHaveBeenCalled()
        expect(cap.fullCanvas!.width).toBe(120)
        expect(cap.fullCanvas!.height).toBe(80)
        expect(ctx.drawImage).toHaveBeenCalledWith(img, 0, 0, 120, 80)
    })

    it('clamps a zero-size element rect to a 1x1 canvas', async () => {
        stubCanvas()
        const el = document.createElement('div')
        snapdomMock.snapdom.mockResolvedValue({ toSvg: async () => ({}) })

        const cap = new ScreenshotCapture()
        await cap.captureElement(el)

        expect(cap.fullCanvas!.width).toBe(1)
        expect(cap.fullCanvas!.height).toBe(1)
    })

    it('crops from the last full capture and rounds/clamps dimensions', async () => {
        stubCanvas()
        stubScroll(800, 600)
        snapdomMock.snapdom.mockResolvedValue({ toSvg: async () => ({}) })

        const cap = new ScreenshotCapture()
        await cap.capture()

        ctx.drawImage.mockClear()
        const cropped = cap.crop(10, 20, 100.4, 50.6)
        expect(cropped).not.toBe(cap.fullCanvas)
        expect(cropped.width).toBe(100)
        expect(cropped.height).toBe(51)
        expect(ctx.drawImage).toHaveBeenCalledWith(cap.fullCanvas, 10, 20, 100.4, 50.6, 0, 0, 100.4, 50.6)
        expect(cap.croppedCanvas).toBe(cropped)
        expect(cap.getThumbnailUrl()).toBe('data:image/png;base64,AAAA')
    })

    it('throws crop() before any capture', () => {
        stubCanvas()
        const cap = new ScreenshotCapture()
        expect(() => cap.crop(0, 0, 10, 10)).toThrow('capture() must be called first')
        expect(() => cap.precrop(0, 0, 10, 10)).toThrow('capture() must be called first')
    })

    it('precrop replaces the full canvas so later crops use the smaller source', async () => {
        stubCanvas()
        stubScroll(800, 600)
        snapdomMock.snapdom.mockResolvedValue({ toSvg: async () => ({}) })

        const cap = new ScreenshotCapture()
        await cap.capture()

        cap.precrop(0, 0, 400, 300)
        expect(cap.fullCanvas!.width).toBe(400)
        expect(cap.fullCanvas!.height).toBe(300)
        expect(cap.croppedCanvas).toBe(cap.fullCanvas)
    })

    it('getBlob resolves the cropped canvas as a png blob', async () => {
        stubCanvas()
        stubScroll(100, 100)
        snapdomMock.snapdom.mockResolvedValue({ toSvg: async () => ({}) })

        const cap = new ScreenshotCapture()
        await cap.capture()

        const blob = await cap.getBlob()
        expect(blob).toBeInstanceOf(Blob)
        expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    })
})

describe('ScreenshotCapture.fromBlob', () => {
    it('decodes a blob via createImageBitmap into a working capture', async () => {
        stubCanvas()
        const bitmap = { width: 640, height: 480 }
        const createImageBitmap = vi.fn().mockResolvedValue(bitmap)
        vi.stubGlobal('createImageBitmap', createImageBitmap)

        const cap = await ScreenshotCapture.fromBlob(new Blob(['x'], { type: 'image/png' }))

        expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob))
        expect(cap.fullCanvas).not.toBeNull()
        expect(cap.fullCanvas!.width).toBe(640)
        expect(cap.fullCanvas!.height).toBe(480)
        expect(cap.croppedCanvas).toBe(cap.fullCanvas)
        expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0)
        expect(cap.getThumbnailUrl()).toBe('data:image/png;base64,AAAA')
        const blob = await cap.getBlob()
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('image/png')
    })

    it('falls back to an Image element when createImageBitmap is unavailable', async () => {
        stubCanvas()
        vi.stubGlobal('createImageBitmap', undefined)
        const FakeImage = vi.fn(function (this: { naturalWidth: number; naturalHeight: number; onload: (() => void) | null; onerror: (() => void) | null }) {
            this.naturalWidth = 320
            this.naturalHeight = 240
            this.onload = null
            this.onerror = null
        })
        Object.defineProperty(FakeImage.prototype, 'src', {
            configurable: true,
            set(this: { onload: (() => void) | null }, _value: string) {
                queueMicrotask(() => this.onload?.())
            },
        })
        vi.stubGlobal('Image', FakeImage)
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })

        const cap = await ScreenshotCapture.fromBlob(new Blob(['x'], { type: 'image/png' }))

        expect(FakeImage).toHaveBeenCalledTimes(1)
        expect(cap.fullCanvas!.width).toBe(320)
        expect(cap.fullCanvas!.height).toBe(240)
        expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0)
        expect(cap.getThumbnailUrl()).toBe('data:image/png;base64,AAAA')
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    })

    it('rejects with a clear error when the blob cannot be decoded', async () => {
        stubCanvas()
        vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')))

        await expect(ScreenshotCapture.fromBlob(new Blob(['x'], { type: 'image/png' })))
            .rejects.toThrow('Failed to decode pasted image: decode failed')
    })

    it('rejects when the Image fallback fails to decode', async () => {
        stubCanvas()
        vi.stubGlobal('createImageBitmap', undefined)
        const FakeImage = vi.fn(function (this: { onload: (() => void) | null; onerror: (() => void) | null }) {
            this.onload = null
            this.onerror = null
        })
        Object.defineProperty(FakeImage.prototype, 'src', {
            configurable: true,
            set(this: { onerror: (() => void) | null }, _value: string) {
                queueMicrotask(() => this.onerror?.())
            },
        })
        vi.stubGlobal('Image', FakeImage)
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })

        await expect(ScreenshotCapture.fromBlob(new Blob(['x'], { type: 'image/png' })))
            .rejects.toThrow(/^Failed to decode pasted image/)
    })
})
