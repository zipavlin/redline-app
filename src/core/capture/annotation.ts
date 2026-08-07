import { SVG } from '@svgdotjs/svg.js'
import type { Svg, G, Element as SvgElement, Path, Line } from '@svgdotjs/svg.js'
import '@svgdotjs/svg.draggable.js'
import { smoothPath } from '@/domain/pin'

const STROKE_WIDTH        = 3
const HIGHLIGHTER_OPACITY = 0.35
const HIGHLIGHTER_WIDTH   = 16
const MARKER_ID           = 'rl-arrowhead'
const HANDLE_R            = 5
const SEL_COLOR           = '#FF3B30'

interface DraggingHandle {
    update: (dx: number, dy: number) => void
}

export class AnnotationCapture {
    #svg: Svg | null            = null
    #tool: string | null        = null
    #color                      = '#FF3B30'
    #drawing                    = false
    #current: SvgElement | null = null
    #points: [number, number][] = []
    #textInput: HTMLTextAreaElement | null = null
    #history: SvgElement[]      = []
    #handleGroup: G | null      = null
    #selected: SvgElement | null = null
    #draggingHandle: DraggingHandle | null = null   // { handle, update(dx,dy) }
    #handleAnchor: { x: number; y: number } | null = null   // { x, y } – pointer position at handle drag start
    #typeMap: WeakMap<SVGElement, string> = new WeakMap() // SVGElement → tool type string

    // Public

    mount(container: HTMLElement): void {
        const w = document.documentElement.scrollWidth
        const h = document.documentElement.scrollHeight

        this.#svg = SVG()
            .addTo(container)
            .size(w, h)
            .attr({ style: 'position:absolute;top:0;left:0;stroke-linejoin:round;stroke-linecap:round' })

        this.#addArrowMarker()
        this.#handleGroup = this.#svg.group().attr('pointer-events', 'all')

        this.#svg.node.addEventListener('mousedown', this.#onMouseDown.bind(this))
        this.#svg.node.addEventListener('mousemove', this.#onMouseMove.bind(this))
        this.#svg.node.addEventListener('mouseup',   this.#onMouseUp.bind(this))
    }

    unmount(): void {
        this.#destroyTextInput()
        this.#svg?.remove()
        this.#svg = null
    }

    setTool(tool: string | null): void {
        this.#tool = tool
        if (tool !== 'select') this.#deselect()
        this.#svg?.node.style.setProperty('pointer-events', tool ? 'all' : 'none')
        this.#svg?.node.style.setProperty('cursor',
            tool === 'select' ? 'default' : tool ? 'crosshair' : 'default')
    }

    setColor(color: string): void {
        this.#color = color
    }

    undo(): void {
        this.#deselect()
        const last = this.#history.pop()
        last?.remove()
    }

    deleteSelected(): void {
        if (!this.#selected) return
        const idx = this.#history.indexOf(this.#selected)
        if (idx !== -1) this.#history.splice(idx, 1)
        this.#selected.remove()
        this.#deselect()
    }

    isEmpty(): boolean { return this.#history.length === 0 }

    get hasSelection(): boolean { return this.#selected !== null }
    get svgNode(): SVGSVGElement | null { return this.#svg?.node ?? null }

    // Private – geometry
    /** Convert viewport event coords → SVG / document coords (no scroll offset needed
     *  because the SVG is position:absolute top:0 left:0 - rect.top == -scrollY already). */
    #getDocumentCoordinates(e: MouseEvent): [number, number] {
        const rect = this.#svg!.node.getBoundingClientRect()
        return [e.clientX - rect.left, e.clientY - rect.top]
    }

    // Private – arrow marker
    #addArrowMarker(): void {
        const marker = this.#svg!.defs().marker(10, 10).attr({
            id: MARKER_ID,
            viewBox: '0 0 10 10',
            refX: 9, refY: 5,
            markerUnits: 'strokeWidth',
            markerWidth: 8, markerHeight: 8,
            orient: 'auto',
        })
        marker.path('M 0 0 L 10 5 L 0 10 z').fill('context-stroke')
    }

    // Private – mouse handlers
    #onMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return

        if (this.#draggingHandle) return

        e.preventDefault()
        const [x, y] = this.#getDocumentCoordinates(e)

        if (this.#tool === 'select') {
            this.#deselect()
            return
        }

        if (!this.#tool) return

        if (this.#tool === 'text') {
            this.#startText(x, y, e.clientX, e.clientY)
            return
        }

        if (this.#tool === 'erase') return // Handled via per-element listeners

        this.#drawing = true
        this.#points  = [[x, y]]
        const color   = this.#color
        const svg     = this.#svg!

        switch (this.#tool) {
            case 'freehand':
                this.#current = svg.path('').fill('none').stroke({ color, width: STROKE_WIDTH })
                break
            case 'highlighter':
                this.#current = svg.path('').fill('none').stroke({ color, width: HIGHLIGHTER_WIDTH, opacity: HIGHLIGHTER_OPACITY })
                break
            case 'arrow':
                this.#current = svg.line(x, y, x, y).stroke({ color, width: STROKE_WIDTH })
                    .attr('marker-end', `url(#${MARKER_ID})`)
                break
            case 'line':
                this.#current = svg.line(x, y, x, y).stroke({ color, width: STROKE_WIDTH })
                break
            case 'rect':
                this.#current = svg.rect(0, 0).move(x, y).fill('none').stroke({ color, width: STROKE_WIDTH })
                break
            case 'circle':
                this.#current = svg.ellipse(0, 0).move(x, y).fill('none').stroke({ color, width: STROKE_WIDTH })
                break
        }

        this.#handleGroup!.front()
    }

    #onMouseMove(e: MouseEvent): void {
        if (this.#draggingHandle) {
            const [pointerX, pointerY] = this.#getDocumentCoordinates(e)
            const dx = pointerX - this.#handleAnchor!.x
            const dy = pointerY - this.#handleAnchor!.y
            this.#draggingHandle.update(dx, dy)
            this.#handleAnchor = { x: pointerX, y: pointerY }
            this.#refreshHandles()
            return
        }

        if (!this.#drawing || !this.#current) return

        const [x, y] = this.#getDocumentCoordinates(e)
        const [x0, y0] = this.#points[0]
        this.#points.push([x, y])

        switch (this.#tool) {
            case 'freehand':
            case 'highlighter':
                (this.#current as Path).plot(smoothPath(this.#points))
                break
            case 'arrow':
            case 'line':
                (this.#current as Line).plot(x0, y0, x, y)
                break
            case 'rect': {
                const rx = Math.min(x0, x), ry = Math.min(y0, y)
                this.#current.move(rx, ry).size(Math.abs(x - x0), Math.abs(y - y0))
                break
            }
            case 'circle': {
                const cx = Math.min(x0, x), cy = Math.min(y0, y)
                this.#current.move(cx, cy).size(Math.abs(x - x0), Math.abs(y - y0))
                break
            }
        }
    }

    #onMouseUp(_e: MouseEvent): void {
        if (this.#draggingHandle) {
            this.#draggingHandle = null
            this.#handleAnchor   = null
            return
        }

        if (!this.#drawing) return
        this.#drawing = false

        if (this.#current) {
            const type = this.#tool!
            this.#typeMap.set(this.#current.node, type)
            this.#makeSelectable(this.#current)
            this.#history.push(this.#current)
            this.#current = null
        }
        this.#points = []
    }

    // Private – text tool
    #startText(docX: number, docY: number, clientX: number, clientY: number): void {
        this.#destroyTextInput()
        const input = document.createElement('textarea')
        const color = this.#color
        input.style.cssText = [
            `position:fixed`, `left:${clientX}px`, `top:${clientY}px`,
            `min-width:120px`, `min-height:32px`, `background:transparent`,
            `border:1px dashed ${color}`, `color:${color}`,
            `font:bold 16px system-ui,sans-serif`, `padding:2px 4px`,
            `resize:both`, `outline:none`, `z-index:2147483647`,
        ].join(';')
        document.body.appendChild(input)
        input.focus()
        this.#textInput = input

        const commit = (): void => {
            const val = input.value.trim()
            input.remove()
            this.#textInput = null
            if (!val) return
            const el = this.#svg!.text(val)
                .move(docX, docY)
                .font({ family: 'system-ui,sans-serif', size: 16, weight: 'bold' })
                .fill(color)
            this.#typeMap.set(el.node, 'text')
            this.#makeSelectable(el)
            this.#history.push(el)
        }

        input.addEventListener('blur', commit, { once: true })
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                commit()
            }
            if (e.key === 'Escape') {
                input.value = ''
                commit()
            }
        })
    }

    #destroyTextInput(): void {
        this.#textInput?.remove()
        this.#textInput = null
    }

    // Private – selection / handles
    #makeSelectable(el: SvgElement): void {
        el.node.style.cursor = 'move'

        el.on('mousedown.select', (e: Event) => {
            if (this.#tool !== 'select') return
            e.stopPropagation()
            this.#selectElement(el)
        })

        el.on('mousedown.erase', (e: Event) => {
            if (this.#tool !== 'erase') return
            e.stopPropagation()
            const idx = this.#history.indexOf(el)
            if (idx !== -1) this.#history.splice(idx, 1)
            el.remove()
        })

        el.draggable()
        el.on('dragmove.draggable', () => {
            if (this.#selected === el) this.#refreshHandles()
        })
    }

    #selectElement(el: SvgElement): void {
        this.#deselect()
        this.#selected = el
        this.#buildHandles(el, this.#typeMap.get(el.node))
    }

    #deselect(): void {
        if (!this.#selected) return
        this.#handleGroup!.clear()
        this.#selected = null
    }

    #buildHandles(el: SvgElement, type: string | undefined): void {
        this.#handleGroup!.clear()

        const boundingBox = el.bbox()

        this.#handleGroup!.rect(boundingBox.w + 10, boundingBox.h + 10)
            .move(boundingBox.x - 5, boundingBox.y - 5)
            .fill('none')
            .stroke({ color: SEL_COLOR, width: 1, dasharray: '4 3' })
            .attr('pointer-events', 'none')

        if (type === 'rect' || type === 'circle') {
            this.#addResizeHandles(el)
        } else if (type === 'arrow' || type === 'line') {
            this.#addEndpointHandles(el)
        }
    }

    #refreshHandles(): void {
        if (this.#selected) this.#buildHandles(this.#selected, this.#typeMap.get(this.#selected.node))
    }

    #addResizeHandles(el: SvgElement): void {
        const boundingBox = el.bbox()
        const centerX = boundingBox.x + boundingBox.w / 2
        const centerY = boundingBox.y + boundingBox.h / 2

        // Handle IDs: t=top, m=middle, b=bottom, l=left, c=center, r=right
        const handles = [
            { id: 'tl', x: boundingBox.x,  y: boundingBox.y,  cursor: 'nwse-resize' },
            { id: 'tc', x: centerX,         y: boundingBox.y,  cursor: 'ns-resize'   },
            { id: 'tr', x: boundingBox.x2,  y: boundingBox.y,  cursor: 'nesw-resize' },
            { id: 'ml', x: boundingBox.x,   y: centerY,         cursor: 'ew-resize'   },
            { id: 'mr', x: boundingBox.x2,  y: centerY,         cursor: 'ew-resize'   },
            { id: 'bl', x: boundingBox.x,   y: boundingBox.y2, cursor: 'nesw-resize' },
            { id: 'bc', x: centerX,         y: boundingBox.y2, cursor: 'ns-resize'   },
            { id: 'br', x: boundingBox.x2,  y: boundingBox.y2, cursor: 'nwse-resize' },
        ]

        /**
         * Each entry describes how dragging that handle adjusts the shape's origin and size.
         * Positive dx/dy means the pointer moved right/down.
         */
        interface Snap { x: number; y: number; w: number; h: number }
        const resizeDeltas: Record<string, (snap: Snap, dx: number, dy: number) => void> = {
            tl: (snap, dx, dy) => { snap.x += dx; snap.y += dy; snap.w -= dx; snap.h -= dy },
            tc: (snap, _dx, dy) => {               snap.y += dy;               snap.h -= dy },
            tr: (snap, dx, dy) => {               snap.y += dy; snap.w += dx; snap.h -= dy },
            ml: (snap, dx)     => { snap.x += dx;               snap.w -= dx               },
            mr: (snap, dx)     => {                             snap.w += dx               },
            bl: (snap, dx, dy) => { snap.x += dx;               snap.w -= dx; snap.h += dy },
            bc: (snap, _dx, dy) => {                                            snap.h += dy },
            br: (snap, dx, dy) => {                             snap.w += dx; snap.h += dy },
        }

        handles.forEach(({ id, x, y, cursor }) => {
            const handle = this.#handleGroup!.circle(HANDLE_R * 2).center(x, y)
                .fill('white').stroke({ color: SEL_COLOR, width: 1.5 })
            handle.node.style.cursor = cursor

            handle.node.addEventListener('mousedown', (e) => {
                e.stopPropagation()
                const [pointerX, pointerY] = this.#getDocumentCoordinates(e)
                this.#handleAnchor = { x: pointerX, y: pointerY }
                // Snap tracks the shape origin and size as the handle is dragged
                const snap: Snap = { x: el.x() as number, y: el.y() as number, w: el.width() as number, h: el.height() as number }
                this.#draggingHandle = {
                    update: (dx, dy) => {
                        resizeDeltas[id](snap, dx, dy)
                        if (snap.w > 2 && snap.h > 2) {
                            el.move(snap.x, snap.y).size(snap.w, snap.h)
                        }
                    },
                }
            })
        })
    }

    #addEndpointHandles(el: SvgElement): void {
        const x1 = +el.attr('x1'), y1 = +el.attr('y1')
        const x2 = +el.attr('x2'), y2 = +el.attr('y2')

        const endpoints: [number, number, string, string][] = [
            [x1, y1, 'x1', 'y1'],
            [x2, y2, 'x2', 'y2'],
        ]
        endpoints.forEach(([x, y, ax, ay]) => {
            const handle = this.#handleGroup!.circle(HANDLE_R * 2).center(x, y)
                .fill('white').stroke({ color: SEL_COLOR, width: 1.5 })
            handle.node.style.cursor = 'move'

            handle.node.addEventListener('mousedown', (e) => {
                e.stopPropagation()
                const [pointerX, pointerY] = this.#getDocumentCoordinates(e)
                this.#handleAnchor   = { x: pointerX, y: pointerY }
                this.#draggingHandle = {
                    update: (dx, dy) => {
                        el.attr({ [ax]: +el.attr(ax) + dx, [ay]: +el.attr(ay) + dy })
                    },
                }
            })
        })
    }
}
