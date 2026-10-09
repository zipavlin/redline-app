import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

/**
 * Member control in the annotation/video create flows. Both flows share the same
 * Body composer, so the coverage is grouped: the real annotation/video Body are
 * mounted directly for their emit/dismissible behavior, and the orchestrators are
 * driven with stubbed step children + capture classes to prove the assignment runs
 * through the real `useAssignCreatedReportMembers` after the report is saved.
 */
const { toastAdd, captureState } = vi.hoisted(() => ({
    toastAdd: vi.fn(),
    captureState: {
        annotation: null as unknown,
        screenshot: null as unknown,
        video: null as unknown,
    },
}))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))

vi.mock('@nuxt/ui/components/Modal.vue', () => ({
    default: {
        name: 'UModalStub',
        props: ['open', 'dismissible', 'close', 'title', 'description', 'ui'],
        emits: ['update:open'],
        template: '<div class="u-modal-stub"><slot name="body" /><slot name="footer" /></div>',
    },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButtonStub',
        props: ['label', 'variant', 'size', 'icon', 'color', 'loading', 'disabled', 'square', 'ui'],
        emits: ['click'],
        template: '<button class="u-button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>',
    },
}))
vi.mock('@nuxt/ui/components/User.vue', () => ({
    default: {
        name: 'UUserStub',
        props: ['name', 'description', 'avatar', 'size'],
        template: '<span class="u-user-stub" />',
    },
}))
vi.mock('@/components/shared/ui/Editor.vue', () => ({
    default: {
        name: 'EditorStub',
        props: ['modelValue', 'loading', 'placeholder', 'suggestionItems', 'handlers', 'handleImagePaste', 'toolbarItems', 'autofocus'],
        emits: ['update:modelValue', 'submit'],
        template: '<div class="editor-stub" />',
    },
}))
vi.mock('@/components/shared/report/PriorityPopover.vue', () => ({
    default: {
        name: 'PriorityPopoverStub',
        props: ['modelValue', 'open'],
        emits: ['update:modelValue', 'update:open'],
        template: '<div class="priority-popover-stub" />',
    },
}))
vi.mock('@/components/shared/report/MemberPopover.vue', () => ({
    default: {
        name: 'MemberPopoverStub',
        props: ['memberIds', 'open', 'placement', 'size'],
        emits: ['update:memberIds', 'update:open'],
        template: `
            <div class="report-members-stub" :data-open="String(open)">
                <button class="members-open" @click="$emit('update:open', true)">open members</button>
                <button class="members-pick" @click="$emit('update:memberIds', ['u9'])">pick member</button>
            </div>`,
    },
}))
vi.mock('@/components/shared/report/DuePopover.vue', () => ({
    default: {
        name: 'DuePopoverStub',
        props: ['dueAt', 'open', 'placement', 'size'],
        emits: ['update:dueAt', 'update:open'],
        template: '<div class="report-due-stub" />',
    },
}))
// The annotation orchestrator locks body scroll while the capture session is open;
// keep the rest of reka-ui intact for Nuxt UI internals that import it.
vi.mock('reka-ui', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>
    return { ...actual, useBodyScrollLock: () => ({ value: false }) }
})
vi.mock('@/core/capture/annotation', () => ({
    AnnotationCapture: class {
        mount = vi.fn()
        unmount = vi.fn()
        setTool = vi.fn()
        isEmpty = vi.fn(() => false)
        constructor() { captureState.annotation = this }
    },
}))
vi.mock('@/core/capture/screenshot', () => ({
    ScreenshotCapture: class {
        fullCanvas = { width: 200, height: 200 }
        capture = vi.fn().mockResolvedValue(undefined)
        precrop = vi.fn()
        crop = vi.fn()
        getThumbnailUrl = vi.fn(() => 'data:image/png;base64,thumb')
        getBlob = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
        constructor() { captureState.screenshot = this }
    },
}))
vi.mock('@/core/capture/video', () => ({
    VideoCapture: class {
        onTick: unknown = null
        onReady: ((blob: Blob) => void) | null = null
        start = vi.fn().mockResolvedValue(undefined)
        pause = vi.fn()
        resume = vi.fn()
        stop = vi.fn()
        cancel = vi.fn()
        constructor() { captureState.video = this }
    },
}))

import AnnotationBody from '@/components/widget/create/annotation/Body.vue'
import VideoBody from '@/components/widget/create/video/Body.vue'
import CreateAnnotation from '@/components/widget/create/CreateAnnotation.vue'
import CreateVideo from '@/components/widget/create/CreateVideo.vue'

const memberUser = { id: 'me', name: 'Me Myself', email: 'me@test.dev', role: 'reporter' }

/** Step children are explicitly imported by the orchestrators, so VTU stubs them by name. */
const stepStubs = {
    Annotation: { name: 'AnnotationStub', emits: ['continue', 'cancel'], template: '<div class="annotation-stub" />' },
    Crop: { name: 'CropStub', emits: ['done', 'back', 'cancel'], template: '<div class="crop-stub" />' },
    Body: { name: 'BodyStub', emits: ['submit', 'back', 'cancel'], template: '<div class="body-stub" />' },
    Record: { name: 'RecordStub', emits: ['save', 'pause', 'resume', 'exit'], template: '<div class="record-stub" />' },
    Review: { name: 'ReviewStub', emits: ['retake', 'next', 'cancel'], template: '<div class="review-stub" />' },
}

let wrappers: VueWrapper[] = []

beforeEach(() => {
    toastAdd.mockClear()
    captureState.annotation = null
    captureState.screenshot = null
    captureState.video = null
    // happy-dom does not implement object URLs.
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
    while (wrappers.length) wrappers.pop()?.unmount()
    document.body.innerHTML = ''
})

// Body composers.

function mountBody(component: Component, user: unknown) {
    const store = { auth: { user, callback: null, authView: 'login' } }
    const wrapper = mount(component, { global: { provide: { store } } })
    wrappers.push(wrapper)
    return wrapper
}

function modalDismissible(wrapper: VueWrapper): unknown {
    return wrapper.findComponent({ name: 'UModalStub' }).props('dismissible')
}

describe.each([
    ['annotation', AnnotationBody],
    ['video', VideoBody],
] as const)('create %s Body member control', (_flow, BodyComponent) => {
    it('shows the members control only for the signed-in user', () => {
        const guest = mountBody(BodyComponent, null)
        expect(guest.find('.report-members-stub').exists()).toBe(false)

        const member = mountBody(BodyComponent, memberUser)
        expect(member.find('.report-members-stub').exists()).toBe(true)
    })

    it('emits picked member ids and locks dismissal while a nested picker is open', async () => {
        const wrapper = mountBody(BodyComponent, memberUser)
        const members = wrapper.findComponent({ name: 'MemberPopoverStub' })
        const priority = wrapper.findComponent({ name: 'PriorityPopoverStub' })

        expect(modalDismissible(wrapper)).toBe(true)

        members.vm.$emit('update:memberIds', ['u9'])
        wrapper.findComponent({ name: 'EditorStub' }).vm.$emit('update:modelValue', '<p>hi</p>')
        await nextTick()
        wrapper.findComponent({ name: 'EditorStub' }).vm.$emit('submit')
        await nextTick()

        expect(wrapper.emitted('submit')?.at(-1)).toEqual(['<p>hi</p>', 'normal', ['u9'], null])

        members.vm.$emit('update:open', true)
        await nextTick()
        expect(modalDismissible(wrapper)).toBe(false)

        members.vm.$emit('update:open', false)
        priority.vm.$emit('update:open', true)
        await nextTick()
        expect(modalDismissible(wrapper)).toBe(false)

        priority.vm.$emit('update:open', false)
        await nextTick()
        expect(modalDismissible(wrapper)).toBe(true)
    })
})

// Orchestrators.

function makeFlowStore(user: unknown = memberUser) {
    return reactive({
        mode: null as 'pin' | 'video' | 'annotation' | null,
        capturing: false,
        auth: { user, callback: null, authView: 'login' },
        report: { active: null as { id: string } | null, list: [] as unknown[], pending: null },
        loadReports: vi.fn(),
    })
}

function makeFlowApi() {
    return {
        report: {
            store: vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                data: { id: 'r1', status: 'new', created_at: '2026-01-01T00:00:00Z' },
            }),
            addMembers: vi.fn().mockResolvedValue({ ok: true, status: 200, data: { members: [] } }),
        },
        screenshot: { store: vi.fn().mockResolvedValue({ ok: true, status: 200, data: {} }) },
        video: { store: vi.fn().mockResolvedValue({ ok: true, status: 200, data: {} }) },
    }
}

type FlowStore = ReturnType<typeof makeFlowStore>
type FlowApi = ReturnType<typeof makeFlowApi>

function mountFlow(component: Component, store: FlowStore, api: FlowApi) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = mount(component, {
        global: {
            plugins: [[VueQueryPlugin, { queryClient }]],
            provide: { redline: { api, config: {} }, store },
            stubs: stepStubs,
        },
    })
    wrappers.push(wrapper)
    return wrapper
}

async function driveAnnotationToBody(store: FlowStore, wrapper: VueWrapper) {
    store.mode = 'annotation'
    await flushPromises()
    wrapper.findComponent({ name: 'AnnotationStub' }).vm.$emit('continue')
    await flushPromises()
    wrapper.findComponent({ name: 'CropStub' }).vm.$emit('done', { x: 0, y: 0, w: 10, h: 10 })
    await nextTick()
}

async function driveVideoToBody(store: FlowStore, wrapper: VueWrapper) {
    store.mode = 'video'
    await flushPromises()
    const video = captureState.video as { onReady: ((blob: Blob) => void) | null }
    video.onReady?.(new Blob(['v'], { type: 'video/webm' }))
    await nextTick()
    wrapper.findComponent({ name: 'ReviewStub' }).vm.$emit('next')
    await nextTick()
}

function emitBodySubmit(wrapper: VueWrapper, body: string, memberIds: string[], dueAt: string | null = null) {
    wrapper.findComponent({ name: 'BodyStub' }).vm.$emit('submit', body, 'normal', memberIds, dueAt)
}

describe('create flow member assignment', () => {
    it('assigns the union of picked ids and mentions after an annotation report is created', async () => {
        const store = makeFlowStore()
        const api = makeFlowApi()
        const wrapper = mountFlow(CreateAnnotation, store, api)

        await driveAnnotationToBody(store, wrapper)
        emitBodySubmit(wrapper, '<p><span data-type="mention" data-id="u3">@C</span></p>', ['u2'])
        await flushPromises()

        expect(api.report.store).toHaveBeenCalledTimes(1)
        expect(api.report.addMembers).toHaveBeenCalledWith('r1', ['u2', 'u3'])
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Report submitted', color: 'success' })
        expect(store.mode).toBeNull()
    })

    it('keeps the report success path when annotation member assignment fails', async () => {
        const store = makeFlowStore()
        const api = makeFlowApi()
        api.report.addMembers.mockResolvedValue({
            ok: false,
            status: 422,
            data: { message: 'One or more user ids are unknown.' },
        })
        const wrapper = mountFlow(CreateAnnotation, store, api)

        await driveAnnotationToBody(store, wrapper)
        emitBodySubmit(wrapper, '<p>drawn</p>', ['u2'])
        await flushPromises()

        expect(api.report.store).toHaveBeenCalledTimes(1)
        expect(toastAdd).toHaveBeenCalledWith({ title: 'One or more user ids are unknown.', color: 'error' })
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Report submitted', color: 'success' })
    })

    it('assigns picked members after a video report is created', async () => {
        const store = makeFlowStore()
        const api = makeFlowApi()
        const wrapper = mountFlow(CreateVideo, store, api)

        await driveVideoToBody(store, wrapper)
        emitBodySubmit(wrapper, '<p>recording</p>', ['u5'])
        await flushPromises()

        expect(api.report.store).toHaveBeenCalledTimes(1)
        expect(api.report.addMembers).toHaveBeenCalledWith('r1', ['u5'])
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Report submitted', color: 'success' })
    })

    it('does not assign members when nothing was picked or mentioned', async () => {
        const store = makeFlowStore()
        const api = makeFlowApi()
        const wrapper = mountFlow(CreateVideo, store, api)

        await driveVideoToBody(store, wrapper)
        emitBodySubmit(wrapper, '<p>recording</p>', [])
        await flushPromises()

        expect(api.report.store).toHaveBeenCalledTimes(1)
        expect(api.report.addMembers).not.toHaveBeenCalled()
    })

    it('threads the deadline into the annotation create payload', async () => {
        const store = makeFlowStore()
        const api = makeFlowApi()
        const wrapper = mountFlow(CreateAnnotation, store, api)

        await driveAnnotationToBody(store, wrapper)
        emitBodySubmit(wrapper, '<p>drawn</p>', [], '2026-06-15T22:00:00.000Z')
        await flushPromises()

        expect(api.report.store).toHaveBeenCalledWith(
            expect.objectContaining({ due_at: '2026-06-15T22:00:00.000Z' }),
        )
    })

    it('threads the deadline into the video create payload', async () => {
        const store = makeFlowStore()
        const api = makeFlowApi()
        const wrapper = mountFlow(CreateVideo, store, api)

        await driveVideoToBody(store, wrapper)
        emitBodySubmit(wrapper, '<p>recording</p>', [], '2026-06-15T22:00:00.000Z')
        await flushPromises()

        expect(api.report.store).toHaveBeenCalledWith(
            expect.objectContaining({ due_at: '2026-06-15T22:00:00.000Z' }),
        )
    })
})
