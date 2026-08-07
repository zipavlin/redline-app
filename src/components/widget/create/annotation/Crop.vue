<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { SVG } from '@svgdotjs/svg.js'
import { useConfirm } from '@/composables/useConfirm'
import type { ScreenshotCapture } from '@/core/capture/screenshot'
import { COLORS } from '@/domain/color'

interface CaptureViewport { y: number; w: number; h: number; locked: boolean; pageW: number; pageH: number }
interface CropRect { x: number; y: number; w: number; h: number }

const props = defineProps<{
    capture: ScreenshotCapture | null
    captureViewport: CaptureViewport | null
}>()
const emit = defineEmits<{ done: [rect: CropRect]; back: []; cancel: [] }>()

const { confirm } = useConfirm()
const open = ref(true)
const cropCanvasRef = ref<HTMLCanvasElement | null>(null)
// Natural-size layer wrapping the canvas so the crop SVG overlays the *canvas* exactly
// (both scroll together inside the outer viewport). Overlaying the scroll viewport instead
// made the crop rect misalign with the image for tall whole-page captures.
const cropInnerRef = ref<HTMLElement | null>(null)

const CROP_SEL_COLOR = COLORS[0].value

let pendingCrop: CropRect | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cropSvg: any = null
let cropSvgCleanup: (() => void) | null = null

watch(cropCanvasRef, (canvas) => {
    if (canvas) _enter()
}, { flush: 'post' })

onUnmounted(() => _exit())

function _enter() {
    const canvas = cropCanvasRef.value
    const inner = cropInnerRef.value
    const full = props.capture?.fullCanvas
    if (!canvas || !inner || !full) return

    _exit()

    canvas.width = full.width
    canvas.height = full.height
    canvas.getContext('2d')!.drawImage(full, 0, 0)

    const HANDLE_R = Math.max(Math.round(full.width / 180), 10)
    const STROKE_W = Math.max(Math.max(1, Math.round(full.width / 800)), 2)

    const bounds = { x: 0, y: 0, w: full.width, h: full.height }
    const vp = props.captureViewport
    let crop: CropRect = (vp && !vp.locked)
        ? { x: 0, y: vp.y, w: Math.min(vp.w, full.width), h: Math.min(vp.h, full.height - vp.y) }
        : { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
    pendingCrop = { ...crop }

    cropSvg = SVG()
        .addTo(inner)
        .viewbox(0, 0, full.width, full.height)
        .attr({ style: 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none', overflow: 'visible' })

    const maskId = 'rl-crop-hole'
    const defs = cropSvg.defs()
    const mask = defs.element('mask').attr('id', maskId)
    mask.element('rect').attr({ width: full.width, height: full.height, fill: 'white' })
    const maskHole = mask.element('rect').attr({ x: crop.x, y: crop.y, width: crop.w, height: crop.h, fill: 'black' })

    cropSvg.rect(full.width, full.height).fill('rgba(0,0,0,0.45)').attr('mask', `url(#${maskId})`).attr('pointer-events', 'none')

    const cropOutline = cropSvg.rect(crop.w, crop.h).move(crop.x, crop.y)
        .fill('none').stroke({ color: 'white', width: STROKE_W }).attr('pointer-events', 'fill').node as SVGRectElement
    cropOutline.style.cursor = 'move'
    cropOutline.style.pointerEvents = 'all'

    const HANDLE_IDS = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'] as const
    const CURSORS: Record<string, string> = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize', tc: 'ns-resize', bc: 'ns-resize', ml: 'ew-resize', mr: 'ew-resize' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEls: Record<string, any> = {}
    HANDLE_IDS.forEach((id) => {
        const h = cropSvg.circle(HANDLE_R * 2).fill('white').stroke({ color: CROP_SEL_COLOR, width: STROKE_W })
        h.node.style.cursor = CURSORS[id]
        h.node.style.pointerEvents = 'all'
        handleEls[id] = h
    })

    function svgCoords(e: MouseEvent) {
        const r = canvas!.getBoundingClientRect()
        return { x: (e.clientX - r.left) * full!.width / r.width, y: (e.clientY - r.top) * full!.height / r.height }
    }
    function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
    function handlePos(c: CropRect): Record<string, [number, number]> {
        const mx = c.x + c.w / 2
        const my = c.y + c.h / 2
        return { tl: [c.x, c.y], tc: [mx, c.y], tr: [c.x + c.w, c.y], ml: [c.x, my], mr: [c.x + c.w, my], bl: [c.x, c.y + c.h], bc: [mx, c.y + c.h], br: [c.x + c.w, c.y + c.h] }
    }
    function updateUI() {
        maskHole.attr({ x: crop.x, y: crop.y, width: crop.w, height: crop.h })
        cropOutline.setAttribute('x', String(crop.x))
        cropOutline.setAttribute('y', String(crop.y))
        cropOutline.setAttribute('width', String(crop.w))
        cropOutline.setAttribute('height', String(crop.h))
        const pos = handlePos(crop)
        HANDLE_IDS.forEach((id) => handleEls[id].center(...pos[id]))
        pendingCrop = { ...crop }
    }
    updateUI()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let drag: any = null
    const _onDocMouseMove = (e: MouseEvent) => {
        if (!drag) return
        const p = svgCoords(e)
        const dx = p.x - drag.start.x
        const dy = p.y - drag.start.y
        const sc = drag.start.crop
        if (drag.type === 'move') {
            crop = { x: clamp(sc.x + dx, bounds.x, bounds.x + bounds.w - sc.w), y: clamp(sc.y + dy, bounds.y, bounds.y + bounds.h - sc.h), w: sc.w, h: sc.h }
        } else {
            const id = drag.id
            let { x, y, w, h } = sc
            if (id === 'tl') {
                x = clamp(sc.x + dx, bounds.x, sc.x + sc.w - 10)
                y = clamp(sc.y + dy, bounds.y, sc.y + sc.h - 10)
                w = sc.w - (x - sc.x)
                h = sc.h - (y - sc.y)
            }
            if (id === 'tc') {
                y = clamp(sc.y + dy, bounds.y, sc.y + sc.h - 10)
                h = sc.h - (y - sc.y)
            }
            if (id === 'tr') {
                y = clamp(sc.y + dy, bounds.y, sc.y + sc.h - 10)
                w = clamp(sc.w + dx, 10, bounds.x + bounds.w - sc.x)
                h = sc.h - (y - sc.y)
            }
            if (id === 'ml') {
                x = clamp(sc.x + dx, bounds.x, sc.x + sc.w - 10)
                w = sc.w - (x - sc.x)
            }
            if (id === 'mr') {
                w = clamp(sc.w + dx, 10, bounds.x + bounds.w - sc.x)
            }
            if (id === 'bl') {
                x = clamp(sc.x + dx, bounds.x, sc.x + sc.w - 10)
                w = sc.w - (x - sc.x)
                h = clamp(sc.h + dy, 10, bounds.y + bounds.h - sc.y)
            }
            if (id === 'bc') {
                h = clamp(sc.h + dy, 10, bounds.y + bounds.h - sc.y)
            }
            if (id === 'br') {
                w = clamp(sc.w + dx, 10, bounds.x + bounds.w - sc.x)
                h = clamp(sc.h + dy, 10, bounds.y + bounds.h - sc.y)
            }
            crop = { x, y, w, h }
        }
        updateUI()
    }
    const _onDocMouseUp = () => { drag = null }
    document.addEventListener('mousemove', _onDocMouseMove)
    document.addEventListener('mouseup', _onDocMouseUp)
    cropSvgCleanup = () => {
        document.removeEventListener('mousemove', _onDocMouseMove)
        document.removeEventListener('mouseup', _onDocMouseUp)
    }

    cropOutline.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault()
        const p = svgCoords(e)
        drag = { type: 'move', start: { crop: { ...crop }, x: p.x, y: p.y } }
    })
    HANDLE_IDS.forEach((id) => {
        handleEls[id].node.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            const p = svgCoords(e)
            drag = { type: 'handle', id, start: { crop: { ...crop }, x: p.x, y: p.y } }
        })
    })
}

function _exit() {
    cropSvgCleanup?.()
    cropSvgCleanup = null
    cropSvg?.remove()
    cropSvg = null
}

function onSubmit() {
    const full = props.capture?.fullCanvas
    if (!full) return
    const crop = pendingCrop ?? { x: 0, y: 0, w: full.width, h: full.height }
    _exit()
    emit('done', crop)
}

async function onClose() {
    if (await confirm('Discard report', 'All progress will be lost.')) emit('cancel')
    else open.value = true
}
</script>

<template>
    <UModal
        v-model:open="open"
        title="Crop screenshot"
        description="Step 2 of 3 — Crop screenshot"
        :ui="{ content: 'max-w-[min(900px,calc(100vw-32px))]' }"
        @update:open="(v: boolean) => !v && onClose()"
    >
        <template #header>
            <UUser
                size="sm"
                name="Crop screenshot"
                description="Step 2 — 3"
                :avatar="{icon: 'i-lucide-crop'}"
            />
            <UButton
                size="sm"
                square
                icon="i-lucide-x"
                @click="onClose"
            />
        </template>
        <template #body>
            <div class="select-none max-h-[50vh] overflow-y-auto">
                <div ref="cropInnerRef" class="relative">
                    <canvas ref="cropCanvasRef" class="block w-full h-auto" />
                </div>
            </div>
        </template>
        <template #footer>
            <UButton
                variant="soft"
                @click="emit('back')"
                label="Back"
            />
            <UButton
                color="success"
                variant="subtle"
                trailing-icon="i-lucide-arrow-right"
                @click="onSubmit"
                label="Continue"
            />
        </template>
    </UModal>
</template>
