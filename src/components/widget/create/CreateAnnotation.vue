<script setup lang="ts">
/**
 * Annotation capture orchestrator: annotate → crop → describe. Wraps the
 * framework-agnostic AnnotationCapture + ScreenshotCapture classes.
 */
import { nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useBodyScrollLock } from 'reka-ui'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { useConfirm } from '@/composables/useConfirm'
import { ScreenshotCapture } from '@/core/capture/screenshot'
import { AnnotationCapture } from '@/core/capture/annotation'
import { pagePixelsToPin } from '@/domain/pin'
import type { Priority } from '@/domain/priority'
import { useCreateReport } from '@/resources/report/mutations'
import { useAssignCreatedReportMembers } from '@/resources/report/mentions'
import Annotation from '@/components/widget/create/annotation/Annotation.vue'
import Crop from '@/components/widget/create/annotation/Crop.vue'
import Body from '@/components/widget/create/annotation/Body.vue'
import { useToast } from '@nuxt/ui/composables/useToast'

interface CaptureViewport { y: number; w: number; h: number; locked: boolean; pageW: number; pageH: number }
interface CropRect { x: number; y: number; w: number; h: number }

const { confirm } = useConfirm()
const store = useStore<WidgetStore>()
const toast = useToast()
const createReport = useCreateReport()
const { assign } = useAssignCreatedReportMembers()

// State
const step = ref<'annotation' | 'crop' | 'body' | null>(null)
const overlayContainerRef = ref<HTMLElement | null>(null)
const overlayRef = shallowRef<AnnotationCapture | null>(null)
const capture = shallowRef<ScreenshotCapture | null>(null)
const captureViewport = ref<CaptureViewport | null>(null)
const pendingPin = ref<{ x: number; y: number } | null>(null)
const thumbnailUrl = ref('')
const submitting = ref(false)

/**
 * Scroll lock for the whole annotate→crop→describe session (owned here so it survives
 * the Annotation toolbar unmounting between steps). Uses reka-ui's body scroll lock - the
 * same one Nuxt UI modals use - so it compensates for the scrollbar width (no layout jump
 * on lock, no stray horizontal scrollbar on unlock). The toolbar toggles it via v-model.
 */
const isScrollLocked = useBodyScrollLock()

let overlay: AnnotationCapture | null = null

// Watchers
watch(() => store.mode, async (mode: string | null) => {
    if (mode === 'annotation' && step.value === null) {
        _enter()
    } else if (mode !== 'annotation' && step.value !== null) {
        if (overlay && !overlay.isEmpty()) {
            const ok = await confirm('Leave annotation', 'All annotations will be lost.')
            if (!ok) {
                store.mode = 'annotation'
                return
            }
        }
        _exit()
    }
})

onUnmounted(() => {
    overlay?.unmount()
    overlay = null
    isScrollLocked.value = false
})

// Functions
function _enter() {
    isScrollLocked.value = true
    step.value = 'annotation'
    nextTick(() => {
        if (!overlayContainerRef.value) return
        overlay = new AnnotationCapture()
        overlay.mount(overlayContainerRef.value)
        overlayRef.value = overlay
    })
}

function _exit() {
    overlay?.unmount()
    overlay = null
    overlayRef.value = null
    step.value = null
    capture.value = null
    captureViewport.value = null
    pendingPin.value = null
    thumbnailUrl.value = ''
    submitting.value = false
    store.capturing = false
    isScrollLocked.value = false
}

function cancel() {
    _exit()
    store.mode = null
}

async function onAnnotationSubmit() {
    if (!overlay) return
    overlay.setTool(null)

    const scrollLocked = isScrollLocked.value
    const pageW = document.documentElement.scrollWidth
    const pageH = document.documentElement.scrollHeight
    captureViewport.value = { y: window.scrollY, w: window.innerWidth, h: window.innerHeight, locked: scrollLocked, pageW, pageH }

    /**
     * Hide all widget chrome (annotation toolbar + main toolbar) but keep the drawn
     * overlay, so none of it lands in the snapdom capture.
     */
    store.capturing = true
    await nextTick()

    const cap = new ScreenshotCapture()
    try {
        await cap.capture()
    } catch (err) {
        console.error('[redline] capture error:', err)
        toast.add({ title: 'Capture failed - please try again', color: 'error' })
        store.capturing = false
        return
    }

    if (scrollLocked) {
        const vp = captureViewport.value
        cap.precrop(0, vp.y, vp.w, Math.min(vp.h, pageH - vp.y))
    }

    capture.value = cap
    store.capturing = false
    step.value = 'crop'
}

function onCropSubmit(rect: CropRect) {
    const full = capture.value?.fullCanvas
    const vp = captureViewport.value
    if (full) {
        const offsetY = vp?.locked ? (vp.y ?? 0) : 0
        const pageW = vp?.pageW ?? full.width
        const pageH = vp?.pageH ?? full.height
        pendingPin.value = pagePixelsToPin(rect.x + rect.w / 2, rect.y + rect.h / 2 + offsetY, pageW, pageH)
    }
    capture.value!.crop(rect.x, rect.y, rect.w, rect.h)
    thumbnailUrl.value = capture.value!.getThumbnailUrl() ?? ''
    step.value = 'body'
}

async function onBodySubmit(body: string, priority: Priority, memberIds: string[], dueAt: string | null) {
    if (submitting.value) return
    submitting.value = true
    try {
        const screenshot = await capture.value!.getBlob().catch((err) => {
            console.warn('[redline] annotation blob capture failed - submitting without screenshot', err)
            return null
        })
        const saved = await createReport.mutateAsync({
            body: body || '<p>(screenshot)</p>',
            priority,
            dueAt,
            pin: pendingPin.value,
            screenshot,
        })
        // Picked members + body mentions are assigned after the report exists.
        await assign(saved.id, body, memberIds)
        toast.add({ title: 'Report submitted', color: 'success' })
        store.loadReports()
        cancel()
    } catch {
        toast.add({ title: 'Submit failed - please try again', color: 'error' })
    } finally {
        submitting.value = false
    }
}

function onCropClose() {
    capture.value = null
    captureViewport.value = null
    pendingPin.value = null
    thumbnailUrl.value = ''
    step.value = 'annotation'
}

function onBodyClose() {
    step.value = 'crop'
}

</script>

<template>
    <!-- Overlay container lives in the light DOM (full-page SVG drawing surface). -->
    <Teleport to="body">
        <div
            ref="overlayContainerRef"
            v-show="step === 'annotation'"
            style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2147483645;pointer-events:none"
        />
    </Teleport>

    <Annotation
        v-if="step === 'annotation'"
        v-show="!store.capturing"
        v-model:scroll-locked="isScrollLocked"
        :overlay="overlayRef"
        @continue="onAnnotationSubmit"
        @cancel="cancel"
    />
    <Crop
        v-if="step === 'crop'"
        :capture="capture"
        :capture-viewport="captureViewport"
        @done="onCropSubmit"
        @back="onCropClose"
        @cancel="cancel"
    />
    <Body
        v-if="step === 'body'"
        :thumbnail-url="thumbnailUrl"
        :submitting="submitting"
        @submit="onBodySubmit"
        @back="onBodyClose"
        @cancel="cancel"
    />
</template>
