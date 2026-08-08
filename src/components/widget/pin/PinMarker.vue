<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { getPinCoordinates } from '@/core/pin'
import { resolveSelector } from '@/core/selector'
import { elementPixelsToPin, pagePixelsToPin } from '@/domain/pin'
import type { RedlineContext } from '@/composables/useApi'
import type { SelectedReport } from '@/store/widget/selection'
import { useToast } from '@nuxt/ui/composables/useToast'

const props = withDefaults(defineProps<{
    report: SelectedReport
    index: number
    passive?: boolean
}>(), { passive: false })

const redline = inject<RedlineContext>('redline') as RedlineContext
const store = useStore<WidgetStore>()
const toast = useToast()
const rootEl = ref<HTMLElement>()

const canDrag = computed(() => !!store.auth.user && store.auth.user.id === props.report.author?.id)

function openReport() {
    store.openReport(props.report, rootEl.value ?? null)
}

// ── Drag state ────────────────────────────────────────────────────────────────
const dragging = ref(false)
const liveX = ref(0)
const liveY = ref(0)

let startMouseX = 0
let startMouseY = 0
let startPageX = 0
let startPageY = 0

function _onMouseDown(e: MouseEvent) {
    if (!canDrag.value) {
        openReport()
        return
    }

    startMouseX = e.pageX
    startMouseY = e.pageY
    startPageX = props.report._pageX ?? 0
    startPageY = props.report._pageY ?? 0
    liveX.value = startPageX
    liveY.value = startPageY

    document.addEventListener('mousemove', _onMouseMove)
    document.addEventListener('mouseup', _onMouseUp)
}

function _onMouseMove(e: MouseEvent) {
    const dx = e.pageX - startMouseX
    const dy = e.pageY - startMouseY
    if (!dragging.value && Math.hypot(dx, dy) > 5) dragging.value = true
    if (dragging.value) {
        liveX.value = startPageX + dx
        liveY.value = startPageY + dy
    }
}

async function _onMouseUp() {
    document.removeEventListener('mousemove', _onMouseMove)
    document.removeEventListener('mouseup', _onMouseUp)

    if (!dragging.value) {
        openReport()
        return
    }
    dragging.value = false

    const pin = props.report.pin
    const finalPageX = liveX.value
    const finalPageY = liveY.value
    let payload: { x: number; y: number; prefer_selector?: boolean } | undefined

    if (pin?.prefer_selector && typeof props.report.element === 'string') {
        const el = resolveSelector(props.report.element)
        if (el) {
            const r = el.getBoundingClientRect()
            payload = {
                ...elementPixelsToPin(finalPageX, finalPageY, r, window.scrollX, window.scrollY),
                prefer_selector: true,
            }
        }
    }

    if (!payload) {
        payload = pagePixelsToPin(finalPageX, finalPageY, document.documentElement.scrollWidth, document.documentElement.scrollHeight)
    }

    // Optimistic update
    const idx = store.report.list.findIndex((r: SelectedReport) => r.id === props.report.id)
    const original = idx !== -1 ? { ...store.report.list[idx] } : null

    if (idx !== -1) {
        store.report.list[idx] = {
            ...store.report.list[idx],
            _pageX: finalPageX,
            _pageY: finalPageY,
            pin: { ...pin, x: payload.x, y: payload.y },
        }
    }

    try {
        const result = await redline.api.report.move(props.report.id, payload)
        if (result.ok && idx !== -1) {
            const coords = getPinCoordinates(result.data)
            store.report.list[idx] = {
                ...result.data,
                _pageX: coords?.pageX ?? finalPageX,
                _pageY: coords?.pageY ?? finalPageY,
            }
        }
    } catch {
        if (idx !== -1 && original) store.report.list[idx] = original
        toast.add({ title: 'Could not move pin', color: 'error' })
    }
}
</script>

<template>
    <div
        ref="rootEl"
        data-component="pin-marker"
        :data-report-id="report.id"
        class="absolute size-8 rounded-[50%_50%_50%_4px] -translate-y-full flex items-center justify-center shadow-lg pointer-events-auto transition-[filter,transform,box-shadow] duration-150 group"
        :class="{
            'bg-primary': report.status === 'new' || report.status === 'noticed',
            'bg-warning': report.status === 'progress',
            'bg-success': report.status === 'resolved',
            'cursor-grab': canDrag && !dragging,
            'cursor-grabbing': dragging,
            'cursor-pointer': !canDrag,
            'opacity-70': dragging,
            'scale-125 ring-2 ring-(--ui-text-default) ring-offset-1 ring-offset-transparent': store.report.active?.id === report.id,
        }"
        :style="{ left: (dragging ? liveX : report._pageX) + 'px', top: (dragging ? liveY : report._pageY) + 'px' }"
        @mousedown.stop="_onMouseDown"
    >
        <UIcon v-if="report.status === 'new'" name="i-lucide-circle-alert" class="size-[18px] text-inverted" />
    </div>
</template>
