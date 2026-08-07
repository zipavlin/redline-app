import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnnotationCapture } from '@/core/capture/annotation'
import { smoothPath } from '@/domain/pin'

// Minimal behavior-preserving fake for @svgdotjs/svg.js.
/**
 * Real svg.js needs a layout engine (getBBox/getScreenCTM) that happy-dom lacks.
 * The fake produces real SVG DOM nodes (so queries/events work) and mirrors the
 * methods the class actually calls.
 */
const svgMock = vi.hoisted(() => {
    const nodeToEl = new WeakMap<Element, any>()

    function base(tag: string): any {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
        const attrs: Record<string, string> = {}
        const custom: Record<string, Array<(...args: unknown[]) => void>> = {}
        const self: any = {
            node,
            _x: 0, _y: 0, _w: 0, _h: 0,
            attr(name: any, value?: any) {
                if (typeof name === 'object' && name !== null) {
                    for (const [k, v] of Object.entries(name)) self.attr(k, v)
                    return self
                }
                if (value === undefined) return attrs[name]
                attrs[name] = String(value)
                node.setAttribute(name, String(value))
                return self
            },
            addTo(parent: Element) {
                parent.appendChild(node)
                return self
            },
            size(w: number, h: number) { self._w = w; self._h = h; return self },
            move(x: number, y: number) { self._x = x; self._y = y; return self },
            center(x: number, y: number) { self._x = x - self._w / 2; self._y = y - self._h / 2; return self },
            x() { return self._x },
            y() { return self._y },
            width() { return self._w },
            height() { return self._h },
            bbox() {
                if (attrs.x1 !== undefined) {
                    const x1 = +attrs.x1, y1 = +attrs.y1, x2 = +attrs.x2, y2 = +attrs.y2
                    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), x2: Math.max(x1, x2), y2: Math.max(y1, y2) }
                }
                return { x: self._x, y: self._y, w: self._w, h: self._h, x2: self._x + self._w, y2: self._y + self._h }
            },
            on(name: string, fn: (...args: unknown[]) => void) {
                const [type] = name.split('.')
                if (type === 'dragmove') (custom[name] ||= []).push(fn)
                else node.addEventListener(type, fn as EventListener)
                return self
            },
            remove() { node.remove() },
            front() { return self },
            clear() { node.replaceChildren() },
            draggable() { return self },
            fill() { return self },
            stroke() { return self },
            font() { return self },
            plot(...args: any[]) {
                if (args.length === 1 && (Array.isArray(args[0]) || typeof args[0] === 'string')) self._plotArgs = args[0]
                else if (args.length >= 4) self.attr('x1', args[0]).attr('y1', args[1]).attr('x2', args[2]).attr('y2', args[3])
                return self
            },
            _fire(name: string, ...args: unknown[]) { custom[name]?.forEach(fn => fn(...args)) },
        }

        /**
         * Factory methods append the created element to this element's node,
         * matching svg.js semantics so DOM queries work in tests. The method
         * name differs from the SVG element tag for groups (group() → <g>).
         */
        const TAG_BY_METHOD: Record<string, string> = { group: 'g' }
        for (const method of ['defs', 'marker', 'path', 'line', 'rect', 'ellipse', 'text', 'group']) {
            self[method] = () => {
                const child = base(TAG_BY_METHOD[method] ?? method)
                node.appendChild(child.node)
                return child
            }
        }
        self.circle = (r?: number) => {
            const c = base('circle')
            node.appendChild(c.node)
            if (r !== undefined) c._w = r
            return c
        }

        nodeToEl.set(node, self)
        return self
    }

    const SVG = (): any => base('svg')
    const elFor = (node: Element) => nodeToEl.get(node) ?? null

    return { SVG, elFor }
})
vi.mock('@svgdotjs/svg.js', () => ({ SVG: svgMock.SVG }))
vi.mock('@svgdotjs/svg.draggable.js', () => ({}))

// Helpers.

function setup() {
    const container = document.createElement('div')
    document.body.append(container)
    const cap = new AnnotationCapture()
    cap.mount(container)
    return { container, cap, svgNode: cap.svgNode! }
}

/** Direct children of the svg root filtered by tag. */
function svgChildren(svgNode: SVGSVGElement, tag: string): Element[] {
    return [...svgNode.children].filter(c => c.tagName === tag)
}

function down(node: Element, x: number, y: number, button = 0) {
    node.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button, bubbles: true, cancelable: true }))
}
function move(node: Element, x: number, y: number) {
    node.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true, cancelable: true }))
}
function up(node: Element, x: number, y: number) {
    node.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true, cancelable: true }))
}

/** Draw a shape with the given tool from (x0,y0) to (x1,y1) and return its fake element. */
function draw(cap: AnnotationCapture, svgNode: SVGSVGElement, tool: string, x0: number, y0: number, x1: number, y1: number) {
    cap.setTool(tool)
    down(svgNode, x0, y0)
    move(svgNode, x1, y1)
    up(svgNode, x1, y1)
    return svgMock.elFor(svgNode.children[svgNode.children.length - 1])
}

beforeEach(() => {
    Object.defineProperty(document.documentElement, 'scrollWidth', { value: 800, configurable: true })
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 600, configurable: true })
})

afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (document.documentElement as unknown as Record<string, unknown>).scrollWidth
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight
})

// Tests.

describe('AnnotationCapture mount lifecycle', () => {
    it('mounts an svg sized to the document scroll dimensions', () => {
        const { container, cap, svgNode } = setup()
        const root = svgMock.elFor(svgNode)
        expect(root._w).toBe(800)
        expect(root._h).toBe(600)
        expect(container.querySelector('svg')).toBe(svgNode)
        // Arrow marker defs + handle group.
        expect(svgNode.querySelector('defs marker path')).not.toBeNull()
        expect(svgChildren(svgNode, 'g')).toHaveLength(1)
        expect(cap.isEmpty()).toBe(true)

        cap.unmount()
        expect(cap.svgNode).toBeNull()
        expect(container.querySelector('svg')).toBeNull()
    })

    it('setTool controls pointer-events and cursor on the svg node', () => {
        const { cap, svgNode } = setup()
        cap.setTool('rect')
        expect(svgNode.style.pointerEvents).toBe('all')
        expect(svgNode.style.cursor).toBe('crosshair')
        cap.setTool(null)
        expect(svgNode.style.pointerEvents).toBe('none')
        cap.setTool('select')
        expect(svgNode.style.cursor).toBe('default')
    })
})

describe('AnnotationCapture drawing', () => {
    it('draws a rect, commits it to history and undoes it', () => {
        const { cap, svgNode } = setup()
        const rect = draw(cap, svgNode, 'rect', 100, 50, 300, 150)

        expect(cap.isEmpty()).toBe(false)
        expect(rect.node.tagName).toBe('rect')
        expect(rect._x).toBe(100)
        expect(rect._y).toBe(50)
        expect(rect._w).toBe(200)
        expect(rect._h).toBe(100)

        cap.undo()
        expect(cap.isEmpty()).toBe(true)
        expect(rect.node.isConnected).toBe(false)

        cap.undo() // Empty history - no-op, must not throw
        expect(cap.isEmpty()).toBe(true)
    })

    it('draws a freehand path through smoothPath on every move', () => {
        const { cap, svgNode } = setup()
        cap.setTool('freehand')
        down(svgNode, 10, 10)
        move(svgNode, 20, 20)
        move(svgNode, 30, 10)
        up(svgNode, 30, 10)

        const path = svgMock.elFor(svgChildren(svgNode, 'path')[0])
        expect(path._plotArgs).toEqual(smoothPath([[10, 10], [20, 20], [30, 10]]))
    })

    it('draws a line with endpoint coordinates and an arrow marker for the arrow tool', () => {
        const { cap, svgNode } = setup()
        const line = draw(cap, svgNode, 'line', 100, 100, 200, 150)
        expect(line.attr('x1')).toBe('100')
        expect(line.attr('y1')).toBe('100')
        expect(line.attr('x2')).toBe('200')
        expect(line.attr('y2')).toBe('150')

        const arrow = draw(cap, svgNode, 'arrow', 10, 10, 50, 50)
        expect(arrow.attr('marker-end')).toBe('url(#rl-arrowhead)')
    })

    it('draws an ellipse for the circle tool', () => {
        const { cap, svgNode } = setup()
        const circle = draw(cap, svgNode, 'circle', 100, 100, 160, 140)
        expect(circle.node.tagName).toBe('ellipse')
        expect(circle._w).toBe(60)
        expect(circle._h).toBe(40)
    })

    it('ignores non-left mouse buttons', () => {
        const { cap, svgNode } = setup()
        cap.setTool('rect')
        down(svgNode, 100, 100, 2)
        move(svgNode, 200, 200)
        up(svgNode, 200, 200)
        expect(cap.isEmpty()).toBe(true)
    })
})

describe('AnnotationCapture text tool', () => {
    it('commits text on blur and adds it to history', () => {
        const { cap, svgNode } = setup()
        cap.setTool('text')
        down(svgNode, 120, 80, 0)

        const input = document.querySelector('textarea')!
        expect(input).not.toBeNull()
        input.value = 'Hello'
        input.dispatchEvent(new FocusEvent('blur'))

        const text = svgMock.elFor(svgNode.querySelector('text')!)
        expect(text).not.toBeNull()
        expect(text._x).toBe(120)
        expect(text._y).toBe(80)
        expect(cap.isEmpty()).toBe(false)
        expect(document.querySelector('textarea')).toBeNull()
    })

    it('commits text on Enter and drops it on Escape', () => {
        const { cap, svgNode } = setup()
        cap.setTool('text')
        down(svgNode, 10, 10, 0)
        let input = document.querySelector('textarea')!
        input.value = 'Entered'
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(svgNode.querySelector('text')).not.toBeNull()

        down(svgNode, 10, 10, 0)
        input = document.querySelector('textarea')!
        input.value = 'discard me'
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(svgNode.querySelectorAll('text')).toHaveLength(1) // Unchanged.
        expect(document.querySelector('textarea')).toBeNull()
    })

    it('keeps the textarea open on Shift+Enter', () => {
        const { cap, svgNode } = setup()
        cap.setTool('text')
        down(svgNode, 10, 10, 0)

        const input = document.querySelector('textarea')!
        input.value = 'two lines'
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
        expect(document.querySelector('textarea')).toBe(input)
        expect(svgNode.querySelector('text')).toBeNull()
    })
})

describe('AnnotationCapture selection & handles', () => {
    it('selects a shape and clears the selection via setTool', () => {
        const { cap, svgNode } = setup()
        draw(cap, svgNode, 'rect', 100, 50, 300, 150)

        cap.setTool('select')
        const rectNode = svgChildren(svgNode, 'rect')[0]
        down(rectNode, 150, 100)
        expect(cap.hasSelection).toBe(true)
        expect(svgNode.querySelector('g circle')).not.toBeNull() // Resize handles.

        cap.setTool('line') // Non-select tool deselects.
        expect(cap.hasSelection).toBe(false)
        expect(svgNode.querySelectorAll('g circle')).toHaveLength(0)
    })

    it('resizes a rect by dragging its bottom-right handle', () => {
        const { cap, svgNode } = setup()
        const rect = draw(cap, svgNode, 'rect', 100, 50, 300, 150)
        cap.setTool('select')
        down(rect.node, 150, 100)

        const group = svgChildren(svgNode, 'g')[0]
        const handles = group.querySelectorAll('circle')
        expect(handles).toHaveLength(8) // Tl tc tr ml mr bl bc br.

        const br = handles[7]
        down(br, 300, 150) // Handle anchor at its center.
        move(svgNode, 320, 170) // +20,+20

        expect(rect._w).toBe(220)
        expect(rect._h).toBe(120)
        expect(rect._x).toBe(100)
        expect(rect._y).toBe(50)
    })

    it('shrinks a rect via its top-left handle but respects a 2px minimum', () => {
        const { cap, svgNode } = setup()
        const rect = draw(cap, svgNode, 'rect', 100, 50, 300, 150)
        cap.setTool('select')
        down(rect.node, 150, 100)

        const group = svgChildren(svgNode, 'g')[0]
        const tl = group.querySelectorAll('circle')[0]
        down(tl, 100, 50)
        move(svgNode, 60, 30) // dx=-40, dy=-20

        expect(rect._x).toBe(60)
        expect(rect._y).toBe(30)
        expect(rect._w).toBe(240)
        expect(rect._h).toBe(120)
    })

    it('drags an endpoint handle to move a line endpoint', () => {
        const { cap, svgNode } = setup()
        const line = draw(cap, svgNode, 'line', 100, 100, 200, 150)
        cap.setTool('select')
        down(line.node, 150, 125)

        const group = svgChildren(svgNode, 'g')[0]
        const handles = group.querySelectorAll('circle')
        expect(handles).toHaveLength(2) // Both endpoints.

        down(handles[0], 100, 100)
        move(svgNode, 130, 140)

        expect(line.attr('x1')).toBe('130')
        expect(line.attr('y1')).toBe('140')
        expect(line.attr('x2')).toBe('200')
    })

    it('deleteSelected removes the selected shape from history and DOM', () => {
        const { cap, svgNode } = setup()
        const a = draw(cap, svgNode, 'rect', 10, 10, 50, 50)
        const b = draw(cap, svgNode, 'rect', 60, 60, 100, 100)
        expect(cap.isEmpty()).toBe(false)

        cap.setTool('select')
        down(a.node, 30, 30)
        cap.deleteSelected()

        expect(a.node.isConnected).toBe(false)
        expect(b.node.isConnected).toBe(true)
        expect(cap.hasSelection).toBe(false)

        cap.undo() // Removes b.
        expect(cap.isEmpty()).toBe(true)
    })
})

describe('AnnotationCapture erase tool', () => {
    it('removes a shape clicked with the erase tool', () => {
        const { cap, svgNode } = setup()
        const rect = draw(cap, svgNode, 'rect', 100, 50, 300, 150)
        cap.setTool('erase')
        down(rect.node, 200, 100)
        expect(rect.node.isConnected).toBe(false)
        expect(cap.isEmpty()).toBe(true)
    })
})

describe('AnnotationCapture dragmove refresh', () => {
    it('rebuilt the handles when a selected shape fires dragmove', () => {
        const { cap, svgNode } = setup()
        const rect = draw(cap, svgNode, 'rect', 100, 50, 300, 150)
        cap.setTool('select')
        down(rect.node, 150, 100)

        const group = svgChildren(svgNode, 'g')[0]
        expect(group.querySelectorAll('circle')).toHaveLength(8)

        rect._fire('dragmove.draggable')
        expect(group.querySelectorAll('circle')).toHaveLength(8)
        expect(cap.hasSelection).toBe(true)
    })
})
