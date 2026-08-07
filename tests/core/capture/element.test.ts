import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElementCapture } from '@/core/capture/element'

function makeEls() {
    const overlay = document.createElement('div')
    overlay.id = 'overlay'
    const highlight = document.createElement('div')
    highlight.id = 'highlight'
    const confirm = document.createElement('div')
    confirm.hidden = true
    confirm.innerHTML = '<button id="redline-tc-yes"></button><button id="redline-tc-no"></button>'
    document.body.append(overlay, highlight, confirm)
    return { overlay, highlight, confirm }
}

function makeTarget(rect?: { top: number; left: number; width: number; height: number }): HTMLElement {
    const el = document.createElement('button')
    el.textContent = 'target'
    document.body.append(el)
    if (rect) {
        Object.defineProperty(el, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ ...rect, bottom: rect.top + rect.height, right: rect.left + rect.width, x: rect.left, y: rect.top, toJSON: () => ({}) }),
        })
    }
    return el
}

function stubElementFromPoint(el: Element | null) {
    return vi.spyOn(document, 'elementFromPoint').mockReturnValue(el)
}

function mouse(overlay: HTMLElement, type: string, clientX: number, clientY: number) {
    overlay.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true }))
}

function touch(overlay: HTMLElement, clientX: number, clientY: number) {
    const evt = new Event('touchend', { cancelable: true }) as TouchEvent
    Object.defineProperty(evt, 'changedTouches', { value: [{ clientX, clientY }] })
    overlay.dispatchEvent(evt)
}

afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (document.documentElement as unknown as Record<string, unknown>).scrollWidth
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight
})

describe('ElementCapture lifecycle', () => {
    it('enter() shows the overlay; exit() hides it and the highlight', () => {
        const { overlay, highlight } = makeEls()
        const cap = new ElementCapture(overlay, highlight)
        overlay.style.display = 'none'

        cap.enter()
        expect(overlay.style.display).toBe('')
        expect(overlay.getAttribute('listener-attached')).toBeNull() // Listeners live on the instance.

        cap.exit()
        expect(overlay.style.display).toBe('none')
        expect(highlight.hidden).toBe(true)
    })

    it('destroy() removes the global key listeners', () => {
        const { overlay, highlight } = makeEls()
        const cap = new ElementCapture(overlay, highlight)
        cap.enter()
        const spy = vi.spyOn(document, 'removeEventListener')
        cap.destroy()
        expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function))
        expect(spy).toHaveBeenCalledWith('keyup', expect.any(Function))
    })
})

describe('ElementCapture highlighting', () => {
    it('highlights the element under the pointer on mousemove', () => {
        const { overlay, highlight } = makeEls()
        const target = makeTarget({ top: 100, left: 50, width: 200, height: 80 })
        stubElementFromPoint(target)
        const cap = new ElementCapture(overlay, highlight)
        cap.enter()

        mouse(overlay, 'mousemove', 60, 120)

        expect(highlight.hidden).toBe(false)
        expect(highlight.style.top).toBe('100px')
        expect(highlight.style.left).toBe('50px')
        expect(highlight.style.width).toBe('200px')
        expect(highlight.style.height).toBe('80px')
    })

    it('keeps the highlight frozen while Alt is held and resumes on keyup', () => {
        const { overlay, highlight } = makeEls()
        const a = makeTarget({ top: 100, left: 50, width: 200, height: 80 })
        const b = makeTarget({ top: 300, left: 10, width: 100, height: 40 })
        const epSpy = stubElementFromPoint(a)
        const cap = new ElementCapture(overlay, highlight)
        cap.enter()

        mouse(overlay, 'mousemove', 60, 120)
        expect(highlight.style.top).toBe('100px')

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }))
        epSpy.mockReturnValue(b)
        mouse(overlay, 'mousemove', 60, 120)
        expect(highlight.style.top).toBe('100px') // Frozen on A.

        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }))
        mouse(overlay, 'mousemove', 60, 120)
        expect(highlight.style.top).toBe('300px') // Now follows B.
    })

    it('pauseHighlight() suppresses highlighting and click pinning; resume restores them', () => {
        const { overlay, highlight } = makeEls()
        const a = makeTarget({ top: 100, left: 0, width: 100, height: 50 })
        const b = makeTarget({ top: 300, left: 0, width: 100, height: 50 })
        const epSpy = stubElementFromPoint(a)
        const cap = new ElementCapture(overlay, highlight)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()

        mouse(overlay, 'mousemove', 60, 120)
        expect(highlight.style.top).toBe('100px')

        cap.pauseHighlight()
        epSpy.mockReturnValue(b)
        mouse(overlay, 'mousemove', 60, 120)
        expect(highlight.style.top).toBe('100px') // Not updated.
        mouse(overlay, 'click', 60, 120)
        expect(onPinPlaced).not.toHaveBeenCalled()

        cap.resumeHighlight()
        mouse(overlay, 'mousemove', 60, 120)
        expect(highlight.style.top).toBe('300px')
    })

    it('clears the highlight on scroll', () => {
        const { overlay, highlight } = makeEls()
        const target = makeTarget()
        stubElementFromPoint(target)
        const cap = new ElementCapture(overlay, highlight)
        cap.enter()

        mouse(overlay, 'mousemove', 60, 120)
        expect(highlight.hidden).toBe(false)

        document.dispatchEvent(new Event('scroll'))
        expect(highlight.hidden).toBe(true)
    })
})

describe('ElementCapture pin placement', () => {
    it('places an element-relative pin on click over a hovered element', () => {
        const { overlay, highlight } = makeEls()
        const target = makeTarget({ top: 0, left: 0, width: 200, height: 100 })
        stubElementFromPoint(target)
        const cap = new ElementCapture(overlay, highlight)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()

        mouse(overlay, 'mousemove', 50, 50)
        mouse(overlay, 'click', 50, 50)

        expect(onPinPlaced).toHaveBeenCalledWith({ pin: { x: 25, y: 50 }, element: target })
    })

    it('falls back to elementFromPoint when there is no hovered element', () => {
        const { overlay, highlight } = makeEls()
        const target = makeTarget()
        stubElementFromPoint(target)
        const cap = new ElementCapture(overlay, highlight)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()

        mouse(overlay, 'click', 40, 40)

        expect(onPinPlaced).toHaveBeenCalledWith(expect.objectContaining({ element: target }))
    })

    it('places a page-percentage pin when clicking empty space', () => {
        const { overlay, highlight } = makeEls()
        stubElementFromPoint(null)
        Object.defineProperty(document.documentElement, 'scrollWidth', { value: 1000, configurable: true })
        Object.defineProperty(document.documentElement, 'scrollHeight', { value: 500, configurable: true })
        const cap = new ElementCapture(overlay, highlight)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()

        mouse(overlay, 'click', 100, 50)

        expect(onPinPlaced).toHaveBeenCalledWith({ pin: { x: 10, y: 10 }, element: null })
    })

    it('ignores redline overlay elements and the body as click targets', () => {
        const { overlay, highlight } = makeEls()
        const redlineEl = document.createElement('div')
        redlineEl.id = 'redline-host'
        document.body.append(redlineEl)
        stubElementFromPoint(redlineEl)
        const cap = new ElementCapture(overlay, highlight)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()

        mouse(overlay, 'click', 30, 30)
        expect(onPinPlaced).toHaveBeenCalledWith(expect.objectContaining({ element: null }))

        stubElementFromPoint(document.body)
        mouse(overlay, 'click', 30, 30)
        expect(onPinPlaced).toHaveBeenLastCalledWith(expect.objectContaining({ element: null }))
    })
})

describe('ElementCapture touch flow', () => {
    it('shows the confirm UI on touchend and pins via confirmTouch()', () => {
        const { overlay, highlight, confirm } = makeEls()
        const target = makeTarget()
        stubElementFromPoint(target)
        const cap = new ElementCapture(overlay, highlight, confirm)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()
        expect(confirm.hidden).toBe(true)

        touch(overlay, 50, 40)

        expect(confirm.hidden).toBe(false)
        expect(confirm.style.left).toBe('62px')
        expect(confirm.style.top).toBe('52px')

        cap.confirmTouch()
        expect(onPinPlaced).toHaveBeenCalledWith({ pin: { x: 0, y: 0 }, element: target })
        expect(confirm.hidden).toBe(true)
    })

    it('cancelTouch() dismisses the confirm UI and drops the pin', () => {
        const { overlay, highlight, confirm } = makeEls()
        const target = makeTarget()
        stubElementFromPoint(target)
        const cap = new ElementCapture(overlay, highlight, confirm)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()

        touch(overlay, 50, 40)
        cap.cancelTouch()
        cap.confirmTouch()

        expect(confirm.hidden).toBe(true)
        expect(onPinPlaced).not.toHaveBeenCalled()
    })

    it('wires the yes/no confirm buttons', () => {
        const { overlay, highlight, confirm } = makeEls()
        const target = makeTarget()
        stubElementFromPoint(target)
        const cap = new ElementCapture(overlay, highlight, confirm)
        const onPinPlaced = vi.fn()
        cap.onPinPlaced = onPinPlaced
        cap.enter()

        touch(overlay, 50, 40)
        confirm.querySelector('#redline-tc-yes')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(onPinPlaced).toHaveBeenCalledTimes(1)

        touch(overlay, 50, 40)
        confirm.querySelector('#redline-tc-no')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(onPinPlaced).toHaveBeenCalledTimes(1)
    })

    it('does not show the confirm UI when no element is under the touch', () => {
        const { overlay, highlight, confirm } = makeEls()
        stubElementFromPoint(null)
        const cap = new ElementCapture(overlay, highlight, confirm)
        cap.enter()

        touch(overlay, 50, 40)
        expect(confirm.hidden).toBe(true)
    })
})
