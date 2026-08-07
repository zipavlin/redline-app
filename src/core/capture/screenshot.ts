import { snapdom } from '@zumer/snapdom'

const EXCLUDED_IDS = new Set(['redline-host', 'redline-portal', 'redline-markers'])

export class ScreenshotCapture {
    #fullCanvas: HTMLCanvasElement | null    = null
    #croppedCanvas: HTMLCanvasElement | null = null

    async capture(): Promise<HTMLCanvasElement> {
        const width  = document.documentElement.scrollWidth
        const height = document.documentElement.scrollHeight

        const result = await snapdom(document.body, {
            scale: 1,
            width,
            height,
            embedFonts: false,
            filter: (el) => !(el.id && EXCLUDED_IDS.has(el.id)),
            filterMode: 'remove',
        })

        // toSvg() loads the SVG as <img> without crossOrigin — avoids the CORS
        // rejection that toCanvas() triggers by setting crossOrigin="anonymous".
        const img = await result.toSvg()

        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        this.#fullCanvas    = canvas
        this.#croppedCanvas = canvas
        return this.#fullCanvas
    }

    async captureElement(element: Element): Promise<void> {
        const bounding = element.getBoundingClientRect()
        const width  = Math.max(1, Math.round(bounding.width))
        const height = Math.max(1, Math.round(bounding.height))

        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height

        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)

        if (element.tagName === 'IMG') {
            // snapdom doesn't embed the root <img> src as a data URI — draw directly instead.
            ctx.drawImage(element as HTMLImageElement, 0, 0, width, height)
        } else {
            const result = await snapdom(element, {
                scale: 1,
                embedFonts: false,
                filter: (el) => !(el.id && EXCLUDED_IDS.has(el.id)),
                filterMode: 'remove',
            })
            const img = await result.toSvg()
            ctx.drawImage(img, 0, 0, width, height)
        }

        this.#fullCanvas    = canvas
        this.#croppedCanvas = canvas
    }

    crop(x: number, y: number, width: number, height: number): HTMLCanvasElement {
        if (!this.#fullCanvas) throw new Error('capture() must be called first')
        this.#croppedCanvas = this.#cropCanvas(this.#fullCanvas, x, y, width, height)
        return this.#croppedCanvas
    }

    precrop(x: number, y: number, width: number, height: number): void {
        if (!this.#fullCanvas) throw new Error('capture() must be called first')
        const canvas = this.#cropCanvas(this.#fullCanvas, x, y, width, height)
        this.#fullCanvas    = canvas
        this.#croppedCanvas = canvas
    }

    getThumbnailUrl(): string | null {
        return this.#croppedCanvas?.toDataURL('image/png') ?? null
    }

    getBlob(): Promise<Blob> {
        const src = this.#croppedCanvas
        if (!src) return Promise.reject(new Error('crop() must be called first'))
        return new Promise<Blob>((resolve, reject) =>
            src.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png')
        )
    }

    get fullCanvas(): HTMLCanvasElement | null    { return this.#fullCanvas }
    get croppedCanvas(): HTMLCanvasElement | null { return this.#croppedCanvas }

    // ── Private ───────────────────────────────────────────────────────────────
    #cropCanvas(source: CanvasImageSource, x: number, y: number, width: number, height: number): HTMLCanvasElement {
        const canvas  = document.createElement('canvas')
        canvas.width  = Math.max(1, Math.round(width))
        canvas.height = Math.max(1, Math.round(height))
        canvas.getContext('2d')!.drawImage(source, x, y, width, height, 0, 0, width, height)
        return canvas
    }
}
