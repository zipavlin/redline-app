<script setup lang="ts">
/**
 * New-report composer — anchored to the pending pin (UPopover reference + virtual
 * element), with an inline screenshot attach and a rich-text body (UEditor).
 */
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { usePinAnchor } from '@/composables/usePinAnchor'
import { getPinCoordinates } from '@/core/pin'
import { isHtmlEmpty } from '@/core/text'
import { pageToViewport, pinToElementPixels, pinToPagePixels } from '@/domain/pin'
import { useCreateReport } from '@/resources/report/mutations'
import { ScreenshotCapture } from '@/core/capture/screenshot'
import Editor from '@/components/shared/ui/Editor.vue'
import {
    commandsSuggestionItems,
    insertsSuggestionItems,
    listsSuggestionItems,
} from '@/components/shared/ui/editor'
import type { EditorCustomHandlers, EditorSuggestionMenuItem } from '@nuxt/ui'

const store = useStore<WidgetStore>()
const toast = useToast()

const body = ref('')
const submitting = ref(false)
const thumbnailUrl = ref('')
const screenshotCapture = shallowRef<ScreenshotCapture>(new ScreenshotCapture())
const createReport = useCreateReport()
const scrollTick = ref(0)

const customHandlers = {
    // The suggestion menu / toolbar invoke `execute(editor, cmd).run()`, so execute
    // must return a runnable (a TipTap chain). Our screenshot actions aren't editor
    // commands, so return a minimal `{ run }` wrapper instead of a Promise.
    attachScreenshot: {
        canExecute: () => !thumbnailUrl.value,
        execute: () => ({ run: () => { void attachScreenshot() } }),
        isActive: () => !!thumbnailUrl.value,
        isDisabled: () => !!thumbnailUrl.value
    },
    removeScreenshot: {
        canExecute: () => !!thumbnailUrl.value,
        execute: () => ({ run: () => { removeScreenshot() } }),
        isActive: () => !thumbnailUrl.value,
        isDisabled: () => !thumbnailUrl.value
    }
} satisfies EditorCustomHandlers

const suggestionItems = computed<EditorSuggestionMenuItem[][]>(() => {
    const inserts: EditorSuggestionMenuItem[] = [...insertsSuggestionItems]
    if (!thumbnailUrl.value) {
        inserts.push({
            kind: 'attachScreenshot',
            label: 'Screenshot',
            icon: 'i-lucide-camera',
        })
    } else {
        inserts.push({
            kind: 'removeScreenshot',
            label: 'Remove screenshot',
            icon: 'i-lucide-camera-off',
        })
    }
    return [
        listsSuggestionItems,
        inserts,
        commandsSuggestionItems,
    ]
})

const isBodyFilled = computed(() => !isHtmlEmpty(body.value))

const open = computed({
    get: () => !!store.report.pending,
    set: (v: boolean) => { if (!v) cancel() },
})

const pendingDotStyle = computed(() => {
    const pending = store.report.pending
    if (!pending?.pin) return {}
    void scrollTick.value // re-run on scroll
    const { pin, element } = pending
    if (element instanceof Element) {
        const r = element.getBoundingClientRect()
        // Fixed-position dot: element-relative pin in viewport space (no scroll offset).
        const { pageX, pageY } = pinToElementPixels(pin, r, 0, 0)
        return { left: `${pageX}px`, top: `${pageY}px` }
    }
    const { pageX, pageY } = pinToPagePixels(pin, document.documentElement.scrollWidth, document.documentElement.scrollHeight)
    const { viewportX, viewportY } = pageToViewport(pageX, pageY, window.scrollX, window.scrollY)
    return { left: `${viewportX}px`, top: `${viewportY}px` }
})

// Anchor the composer to the pending pin — a point within the annotated element, or a
// virtual element from the pin's page coords. (Shared with Report.vue via usePinAnchor.)
const { reference, side } = usePinAnchor({
    coords: () => {
        const p = store.report.pending
        if (!p?.pin) return null
        if (p.element instanceof Element) {
            const r = p.element.getBoundingClientRect()
            return pinToElementPixels(p.pin, r, window.scrollX, window.scrollY)
        }
        const c = getPinCoordinates(p)
        return c ? { pageX: c.pageX, pageY: c.pageY } : null
    },
    side: () => {
        const p = store.report.pending
        return p?.element instanceof Element && p.pin ? (p.pin.x > 50 ? 'right' : 'left') : 'left'
    },
})

watch(() => store.report.pending, (pinData) => {
    document.removeEventListener('scroll', _onPendingScroll)
    if (!pinData) return
    scrollTick.value++
    document.addEventListener('scroll', _onPendingScroll, { passive: true })
    _enter()
})

onUnmounted(() => document.removeEventListener('scroll', _onPendingScroll))

function cancel() {
    store.report.pending = null
}

async function onSubmit() {
    if (!isBodyFilled.value || submitting.value) return
    submitting.value = true
    try {
        const screenshot = thumbnailUrl.value
            ? await screenshotCapture.value.getBlob().catch((err) => {
                console.warn('[redline] screenshot blob capture failed — submitting without screenshot', err)
                return null
            })
            : null
        await createReport.mutateAsync({
            body: body.value,
            pin: store.report.pending?.pin ?? null,
            element: store.report.pending?.element ?? null,
            screenshot,
        })
        toast.add({ title: 'Report submitted', color: 'success' })
        store.report.pending = null
        store.loadReports()
    } catch {
        toast.add({ title: 'Submit failed — please try again', color: 'error' })
    } finally {
        submitting.value = false
    }
}

async function attachScreenshot() {
    try {
        const el = store.report.pending?.element
        if (el instanceof Element) await screenshotCapture.value.captureElement(el)
        else await screenshotCapture.value.capture()
        thumbnailUrl.value = screenshotCapture.value.getThumbnailUrl?.() ?? ''
        toast.add({ title: 'Screenshot attached', color: 'success' })
    } catch (err) {
        if ((err as { code?: string })?.code !== 'DENIED') toast.add({ title: 'Screenshot failed', color: 'error' })
    }
}

function removeScreenshot() {
    thumbnailUrl.value = ''
    screenshotCapture.value = new ScreenshotCapture()
    toast.add({ title: 'Screenshot removed', color: 'info' })
}

function _enter() {
    body.value = ''
    thumbnailUrl.value = ''
    screenshotCapture.value = new ScreenshotCapture()
}

function _onPendingScroll() {
    scrollTick.value++
}
</script>

<template>
    <!-- Pending pin dot -->
    <div
        v-if="store.report.pending"
        class="fixed pointer-events-none rounded-full bg-primary ring-2 ring-white/30 z-[5]"
        style="width:10px;height:10px;transform:translate(-50%,-50%)"
        :style="pendingDotStyle"
    />

    <UPopover
        v-if="store.report.pending"
        v-model:open="open"
        :reference="reference"
        :content="{ side, align: 'start', sideOffset: 12 }"
        :ui="{ content: 'w-80' }"
        data-component="create-report"
    >
        <template #content>
            <div class="flex flex-col">
                <div class="p-3">
                    <UChatPrompt
                        :loading="submitting"
                        variant="outline"
                        :rows="1"
                        :max-rows="4"
                        @submit="onSubmit"
                    >
                        <template #body>
                            <Editor
                                v-model="body"
                                :loading="submitting"
                                placeholder="Describe your change or issue ..."
                                :suggestion-items="suggestionItems"
                                :handlers="customHandlers"
                                @submit="onSubmit"
                            />
                        </template>
                    </UChatPrompt>
                </div>

                <div class="flex items-center justify-between gap-1 px-3 pb-3">
                    <div class="flex items-center gap-1">
                        <UButton
                            v-if="!thumbnailUrl && store.feature('screenshots')"
                            size="sm"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-camera"
                            aria-label="Attach screenshot"
                            @click="attachScreenshot"
                        />
                        <template v-else-if="thumbnailUrl">
                            <div class="relative flex items-center">
                                <div class="rounded-xl bg-default z-1">
                                    <UButton
                                        size="sm"
                                        color="primary"
                                        variant="subtle"
                                        icon="i-lucide-camera-off"
                                        aria-label="Remove screenshot"
                                        @click="removeScreenshot"
                                    />
                                </div>
                                <img
                                    :src="thumbnailUrl"
                                    alt="Screenshot"
                                    class="rounded-xl object-cover border border-default aspect-square h-6.5 -translate-x-3" />
                            </div>
                        </template>

                    </div>
                    <UButton
                        color="success"
                        variant="solid"
                        icon="i-lucide-send"
                        :disabled="!isBodyFilled"
                        :loading="submitting"
                        @click="onSubmit"
                    >
                        Submit
                    </UButton>
                </div>
            </div>
        </template>
    </UPopover>
</template>
