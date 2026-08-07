import { elementPixelsToPin, pagePixelsToPin, viewportToPage } from '@/domain/pin'

export interface PinData {
    pin: { x: number; y: number }
    element: Element | null
}

interface TouchTarget {
    viewportX: number
    viewportY: number
    el: Element
}

/**
 * PinCapture - click-to-pin mode with element highlighting.
 *
 * Responsibilities:
 * Intercept mouse/touch events to determine where the user clicked
 * Highlight the hovered element
 * Build pin data (absolute page percentage coordinates + element selector)
 * Verify selector reliability via object-identity comparison
 *
 * Usage:
 *   const pc = new PinCapture(overlayEl, highlightEl)
 *   pc.onPinPlaced = (pinData) => ...
 *   pc.enter()
 *   pc.exit()
 */
export class ElementCapture {
    #overlay: HTMLElement
    #highlight: HTMLElement

    #hoveredEl: Element | null = null
    #altFrozen = false
    #highlightPaused = false
    #touchTarget: TouchTarget | null = null
    #touchConfirmEl: HTMLElement | null = null
    #active                          = false

    onPinPlaced: ((pinData: PinData) => void) | null = null  // (pinData) => void

    constructor(overlayEl: HTMLElement, highlightEl: HTMLElement, touchConfirmEl: HTMLElement | null = null) {
        this.#overlay        = overlayEl
        this.#highlight      = highlightEl
        this.#touchConfirmEl = touchConfirmEl

        this.#onKeyDown = e => {
            if (!this.#active) return
            if (e.key === 'Alt' || e.key === 'Meta') this.#altFrozen = true
        }
        this.#onKeyUp = e => {
            if (e.key === 'Alt' || e.key === 'Meta') this.#altFrozen = false
        }
        document.addEventListener('keydown', this.#onKeyDown)
        document.addEventListener('keyup',   this.#onKeyUp)
    }

    enter(): void {
        this.#active = true
        this.#overlay.style.display = ''
        this.#overlay.addEventListener('mousemove', this.#onMouseMove)
        this.#overlay.addEventListener('click',     this.#onClick)
        this.#overlay.addEventListener('touchend',  this.#onTouchEnd, { passive: false })
        document.addEventListener('scroll', this.#onScroll, { capture: true, passive: true })
        this.#touchConfirmEl?.querySelector('#redline-tc-yes')
            ?.addEventListener('click', this.#onConfirmTouch)
        this.#touchConfirmEl?.querySelector('#redline-tc-no')
            ?.addEventListener('click', this.#onCancelTouch)
    }

    exit(): void {
        this.#active      = false
        this.#altFrozen   = false
        this.#touchTarget = null
        this.#overlay.style.display = 'none'
        this.#overlay.removeEventListener('mousemove', this.#onMouseMove)
        this.#overlay.removeEventListener('click',     this.#onClick)
        this.#overlay.removeEventListener('touchend',  this.#onTouchEnd)
        document.removeEventListener('scroll', this.#onScroll, { capture: true })
        this.#touchConfirmEl?.querySelector('#redline-tc-yes')
            ?.removeEventListener('click', this.#onConfirmTouch)
        this.#touchConfirmEl?.querySelector('#redline-tc-no')
            ?.removeEventListener('click', this.#onCancelTouch)
        this.#setHighlight(null)
        if (this.#touchConfirmEl) this.#touchConfirmEl.hidden = true
    }

    destroy(): void {
        this.exit()
        document.removeEventListener('keydown', this.#onKeyDown)
        document.removeEventListener('keyup',   this.#onKeyUp)
    }

    /** Call from the touch confirmation "Pin here?" button. */
    confirmTouch(): void {
        if (!this.#touchTarget) return
        const { viewportX, viewportY, el } = this.#touchTarget
        this.#cleanupTouch()
        this.onPinPlaced?.(this.#buildPinData(viewportX, viewportY, el))
    }

    cancelTouch(): void {
        this.#cleanupTouch()
    }

    pauseHighlight(): void {
        this.#highlightPaused = true
    }

    resumeHighlight(): void {
        this.#highlightPaused = false
    }

    // Private
    #onKeyDown: (e: KeyboardEvent) => void
    #onKeyUp: (e: KeyboardEvent) => void

    #onConfirmTouch = (): void => this.confirmTouch()
    #onCancelTouch  = (): void => this.cancelTouch()

    #onScroll = (): void => this.#setHighlight(null)

    #cleanupTouch(): void {
        if (this.#touchConfirmEl) this.#touchConfirmEl.hidden = true
        this.#setHighlight(null)
        this.#touchTarget = null
    }

    #elementUnder(cx: number, cy: number): Element | null {
        this.#overlay.style.pointerEvents = 'none'
        const el = document.elementFromPoint(cx, cy)
        this.#overlay.style.pointerEvents = ''
        if (!el || el === document.documentElement || el === document.body) return null
        if (el.closest('#redline-host, #redline-portal')) return null
        return el
    }

    #setHighlight(el: Element | null): void {
        this.#hoveredEl = el
        if (!el) {
            this.#highlight.hidden = true
            return
        }
        const r = el.getBoundingClientRect()
        Object.assign(this.#highlight.style, {
            top:    `${r.top}px`,
            left:   `${r.left}px`,
            width:  `${r.width}px`,
            height: `${r.height}px`,
        })
        this.#highlight.hidden = false
    }

    #buildPinData(viewportX: number, viewportY: number, el: Element | null): PinData {
        if (el) {
            const rect = el.getBoundingClientRect()
            // Element-relative capture happens in viewport space (no scroll offset).
            return { pin: elementPixelsToPin(viewportX, viewportY, rect, 0, 0), element: el }
        }
        const scrollW = document.documentElement.scrollWidth
        const scrollH = document.documentElement.scrollHeight
        const { pageX, pageY } = viewportToPage(viewportX, viewportY, window.scrollX, window.scrollY)
        return { pin: pagePixelsToPin(pageX, pageY, scrollW, scrollH), element: null }
    }

    #onMouseMove = (e: MouseEvent): void => {
        if (this.#altFrozen || this.#highlightPaused) return
        this.#setHighlight(this.#elementUnder(e.clientX, e.clientY))
    }

    #onClick = (e: MouseEvent): void => {
        if (this.#highlightPaused) return
        const viewportX = e.clientX, viewportY = e.clientY
        const el = this.#hoveredEl || this.#elementUnder(viewportX, viewportY)
        this.onPinPlaced?.(this.#buildPinData(viewportX, viewportY, el))
    }

    #onTouchEnd = (e: TouchEvent): void => {
        e.preventDefault()
        const touch    = e.changedTouches[0]
        const viewportX = touch.clientX, viewportY = touch.clientY
        const el = this.#elementUnder(viewportX, viewportY)
        if (!el) return

        this.#touchTarget = { viewportX, viewportY, el }
        this.#setHighlight(el)

        if (this.#touchConfirmEl) {
            let left = viewportX + 12, top = viewportY + 12
            if (left + 160 > window.innerWidth)  left = viewportX - 172
            if (top  + 60  > window.innerHeight) top  = viewportY - 72
            Object.assign(this.#touchConfirmEl.style, { left: `${left}px`, top: `${top}px` })
            this.#touchConfirmEl.hidden = false
        }
    }
}
