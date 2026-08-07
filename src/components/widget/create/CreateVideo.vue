<script setup lang="ts">
/**
 * Video capture orchestrator: record → review → describe. Wraps the
 * framework-agnostic VideoCapture class + useCreateReport mutation.
 */
import { ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { useConfirm } from '@/composables/useConfirm'
import { VideoCapture } from '@/core/capture/video'
import { pagePixelsToPin } from '@/domain/pin'
import { useCreateReport } from '@/resources/report/mutations'
import Record from '@/components/widget/create/video/Record.vue'
import Review from '@/components/widget/create/video/Review.vue'
import Body from '@/components/widget/create/video/Body.vue'

const { confirm } = useConfirm()
const store = useStore<WidgetStore>()
const toast = useToast()
const createReport = useCreateReport()

const step = ref<'recording' | 'review' | 'body' | null>(null)
const recTime = ref('00:00')
const recSeconds = ref(0)
const isPaused = ref(false)
const videoUrl = ref('')
const submitting = ref(false)
const pendingPin = ref<{ x: number; y: number } | null>(null)

let _videoCapture: VideoCapture | null = null
let _blob: Blob | null = null

watch(() => store.mode, async (mode: string | null) => {
    if (mode === 'video' && step.value === null) {
        await _start()
    } else if (mode !== 'video' && step.value !== null) {
        const noData = step.value === 'recording' && recSeconds.value === 0
        if (!noData && !(await confirm('Discard recording', 'The recorded video will be lost.'))) {
            store.mode = 'video'
            return
        }
        _exit()
    }
})

function pause() {
    _videoCapture?.pause()
    isPaused.value = true
}
function resume() {
    _videoCapture?.resume()
    isPaused.value = false
}

function onSave() {
    pendingPin.value = pagePixelsToPin(
        window.scrollX + window.innerWidth / 2,
        window.scrollY + window.innerHeight / 2,
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
    )
    _videoCapture?.stop()
}

async function onExit() {
    if (recSeconds.value > 0 && !(await confirm('Discard recording', 'The recorded video will be lost.'))) return
    cancel()
}

function onRetake() {
    _videoCapture?.cancel()
    if (videoUrl.value) {
        URL.revokeObjectURL(videoUrl.value)
        videoUrl.value = ''
    }
    _blob = null
    _videoCapture = null
    isPaused.value = false
    pendingPin.value = null
    step.value = null
    _start()
}

function onNext() { step.value = 'body' }
function onBack() { step.value = 'review' }

async function onSubmit(body: string) {
    if (submitting.value || !_blob) return
    submitting.value = true
    try {
        await createReport.mutateAsync({
            body: body || '<p>(video)</p>',
            pin: pendingPin.value,
            video: _blob,
        })
        toast.add({ title: 'Report submitted', color: 'success' })
        store.loadReports()
        cancel()
    } catch (err) {
        toast.add({ title: (err as Error)?.message || 'Submit failed — please try again', color: 'error' })
    } finally {
        submitting.value = false
    }
}

function cancel() {
    _exit()
    store.mode = null
}

async function _start() {
    _videoCapture = new VideoCapture()
    _blob = null
    _videoCapture.onTick = (secs: number, fmt: string) => {
        recSeconds.value = secs
        recTime.value = fmt
    }
    _videoCapture.onReady = (blob: Blob) => {
        _blob = blob
        _goReview()
    }

    try {
        await _videoCapture.start()
        step.value = 'recording'
        recTime.value = '00:00'
        recSeconds.value = 0
    } catch (err) {
        const code = (err as { code?: string })?.code
        if (code !== 'DENIED') {
            toast.add({ title: code === 'NOT_SECURE' ? 'Screen capture requires HTTPS' : 'Screen capture failed', color: 'error' })
        }
        store.mode = null
    }
}

function _goReview() {
    if (_blob) {
        if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
        videoUrl.value = URL.createObjectURL(_blob)
    }
    step.value = 'review'
}

function _exit() {
    _videoCapture?.cancel()
    if (videoUrl.value) {
        URL.revokeObjectURL(videoUrl.value)
        videoUrl.value = ''
    }
    step.value = null
    recTime.value = '00:00'
    recSeconds.value = 0
    isPaused.value = false
    pendingPin.value = null
    _blob = null
    _videoCapture = null
}
</script>

<template>
    <Record
        v-if="step === 'recording'"
        :rec-time="recTime"
        :rec-seconds="recSeconds"
        :paused="isPaused"
        @save="onSave"
        @pause="pause"
        @resume="resume"
        @exit="onExit"
    />
    <Review
        v-if="step === 'review'"
        :video-url="videoUrl"
        @retake="onRetake"
        @next="onNext"
        @cancel="cancel"
    />
    <Body
        v-if="step === 'body'"
        :submitting="submitting"
        @submit="onSubmit"
        @back="onBack"
        @cancel="cancel"
    />
</template>
