import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const { toastAdd, editorProps } = vi.hoisted(() => ({
    toastAdd: vi.fn(),
    editorProps: { value: undefined as undefined | { handleImagePaste?: (file: File) => boolean | void } },
}))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))

/**
 * The auto-imported Nuxt UI components resolve to their real SFCs (unplugin), so they
 * are module-mocked instead of name-stubbed - the real UPopover/UChatPrompt/UButton
 * are not needed here and would pull in reka-ui presence/teleport behaviour.
 */
vi.mock('@nuxt/ui/components/Popover.vue', () => ({
    default: {
        name: 'UPopoverStub',
        props: ['dismissible'],
        template: '<div class="popover-stub" :data-dismissible="String(dismissible)"><slot name="content" /></div>',
    },
}))
vi.mock('@nuxt/ui/components/ChatPrompt.vue', () => ({
    default: { name: 'UChatPromptStub', template: '<div class="chat-prompt-stub"><slot name="body" /></div>' },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: { name: 'UButtonStub', props: ['label'], template: '<button class="u-button-stub">{{ label }}<slot /></button>' },
}))
vi.mock('@nuxt/ui/components/Tooltip.vue', () => ({
    default: { name: 'UTooltipStub', template: '<span class="u-tooltip-stub"><slot /></span>' },
}))
vi.mock('@nuxt/ui/components/AvatarGroup.vue', () => ({
    default: { name: 'UAvatarGroupStub', props: ['size', 'max'], template: '<span class="u-avatar-group"><slot /></span>' },
}))
vi.mock('@nuxt/ui/components/Avatar.vue', () => ({
    default: { name: 'UAvatarStub', props: ['alt', 'icon', 'size', 'ui'], template: '<span class="u-avatar" :data-icon="icon">{{ alt }}</span>' },
}))
vi.mock('@/components/shared/report/MembersPicker.vue', () => ({
    default: {
        name: 'MembersPickerStub',
        props: ['members', 'candidates', 'canEdit', 'loading'],
        emits: ['add', 'remove'],
        template: `
            <div class="members-picker-stub">
                <button
                    v-for="candidate in candidates"
                    :key="candidate.id"
                    class="mp-add"
                    :data-id="candidate.id"
                    @click="$emit('add', candidate)"
                >{{ candidate.name }}</button>
            </div>`,
    },
}))

/**
 * The shared Editor is explicitly imported by CreateReport; replace it with a stub that
 * records the props it receives (no real TipTap mount).
 */
vi.mock('@/components/shared/ui/Editor.vue', () => ({
    default: {
        name: 'EditorStub',
        props: ['modelValue', 'handleImagePaste', 'suggestionItems', 'handlers', 'loading', 'placeholder', 'autofocus', 'toolbarItems'],
        emits: ['update:modelValue', 'submit'],
        setup(props: { handleImagePaste?: (file: File) => boolean | void }) {
            editorProps.value = props
        },
        template: '<div class="editor-stub" />',
    },
}))

import CreateReport from '@/components/widget/create/CreateReport.vue'
import PrioritySelect from '@/components/shared/ui/PrioritySelect.vue'

interface Ctx {
    fillStyle: string
    fillRect: ReturnType<typeof vi.fn>
    drawImage: ReturnType<typeof vi.fn>
}

let ctx: Ctx

/** happy-dom has no canvas 2D context - install the Object.defineProperty stub. */
function stubCanvas() {
    ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: vi.fn(() => ctx),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
        configurable: true,
        value: vi.fn(() => 'data:image/png;base64,AAAA'),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        value: vi.fn((cb: BlobCallback) => cb(new Blob(['x'], { type: 'image/png' }))),
    })
}

function makeStore(features: string[] = ['screenshots'], user: unknown = null) {
    return {
        auth: { user, callback: null, authView: 'login' },
        settings: { position: 'bottom-right', theme: 'light', expanded: false },
        report: {
            pending: { pin: { x: 50, y: 50 }, element: null },
            list: [],
            loaded: false,
            active: null,
            activeEl: null,
        },
        filter: { type: null },
        unresolvedCount: 0,
        feature: vi.fn((name: string) => features.includes(name)),
        loadReports: vi.fn(),
        unloadReports: vi.fn(),
        sortReports: vi.fn(),
    }
}

function mountReport(
    features: string[] = ['screenshots'],
    opts: { user?: unknown; api?: Record<string, unknown> } = {},
) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const store = makeStore(features, opts.user ?? null)
    const wrapper = mount(CreateReport, {
        global: {
            plugins: [[VueQueryPlugin, { queryClient }]],
            provide: {
                redline: { api: opts.api ?? {}, config: {} },
                store,
            },
        },
    })
    return { wrapper, store }
}

function pastedFile(name = 'shot.png', type = 'image/png'): File {
    return new File(['png-bytes'], name, { type })
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
    toastAdd.mockClear()
    editorProps.value = undefined
    Object.defineProperty(document.documentElement, 'scrollWidth', { value: 1280, configurable: true })
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 720, configurable: true })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toDataURL
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toBlob
    delete (document.documentElement as unknown as Record<string, unknown>).scrollWidth
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight
    document.body.innerHTML = ''
})

describe('CreateReport clipboard image paste', () => {
    it('passes handleImagePaste to the editor when screenshots are enabled', () => {
        stubCanvas()
        wrapper = mountReport(['screenshots']).wrapper

        expect(editorProps.value?.handleImagePaste).toBeTypeOf('function')
    })

    it('does not pass handleImagePaste when screenshots are disabled', () => {
        stubCanvas()
        wrapper = mountReport([]).wrapper

        expect(editorProps.value?.handleImagePaste).toBeUndefined()
    })

    it('attaches a pasted image as the report screenshot and returns true', async () => {
        stubCanvas()
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 200, height: 150 }))
        wrapper = mountReport(['screenshots']).wrapper
        const handler = editorProps.value!.handleImagePaste!

        const result = handler(pastedFile())

        expect(result).toBe(true)
        await flushPromises()

        const img = wrapper!.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('data:image/png;base64,AAAA')
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Screenshot attached', color: 'success' })
    })

    it('keeps the existing screenshot when one is already attached', async () => {
        stubCanvas()
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 200, height: 150 }))
        wrapper = mountReport(['screenshots']).wrapper
        const handler = editorProps.value!.handleImagePaste!

        expect(handler(pastedFile('first.png'))).toBe(true)
        await flushPromises()
        const firstSrc = wrapper!.find('img').attributes('src')

        const second = handler(pastedFile('second.png'))

        expect(second).toBe(false)
        await flushPromises()
        expect(wrapper!.find('img').attributes('src')).toBe(firstSrc)
        expect(toastAdd).toHaveBeenCalledTimes(1)
    })

    it('shows an error toast and leaves the composer untouched when decoding fails', async () => {
        stubCanvas()
        vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')))
        wrapper = mountReport(['screenshots']).wrapper

        const result = editorProps.value!.handleImagePaste!(pastedFile())

        expect(result).toBe(true)
        await flushPromises()
        expect(wrapper!.find('img').exists()).toBe(false)
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Screenshot failed', color: 'error' })
    })
})

const memberUser = { id: 'me', name: 'Me Myself', role: 'reporter', isDeveloper: false, isAdmin: false }

function membersApi() {
    return {
        report: {
            store: vi.fn().mockResolvedValue({ ok: true, status: 200, data: { id: 'r1', status: 'new', created_at: '2026-01-01T00:00:00Z' } }),
            addMembers: vi.fn().mockResolvedValue({ ok: true, status: 200, data: { members: [] } }),
        },
        user: {
            index: vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                data: {
                    data: [{ id: 'u2', status: 'approved', created_at: '2026-01-01T00:00:00Z', name: 'Zoe Dev', initials: 'ZD' }],
                    meta: { total: 1 },
                    counts: { all: 1, active: 1, pending: 0 },
                },
            }),
        },
    }
}

function mountComposerWithMembers() {
    const api = membersApi()
    const mounted = mountReport(['screenshots'], { user: memberUser, api })
    return { ...mounted, api }
}

async function submitComposer(w: VueWrapper, withMember: boolean) {
    await flushPromises()
    if (withMember) {
        await w.find('.mp-add[data-id="u2"]').trigger('click')
        await nextTick()
    }
    w.findComponent({ name: 'EditorStub' }).vm.$emit('update:modelValue', '<p>hi</p>')
    await nextTick()
    const submit = w.findAll('button').find(button => button.text().includes('Submit'))
    await submit!.trigger('click')
    await flushPromises()
}

describe('CreateReport member assignment', () => {
    it('assigns the selected members after the report is created', async () => {
        stubCanvas()
        const mounted = mountComposerWithMembers()
        wrapper = mounted.wrapper

        await submitComposer(mounted.wrapper, true)

        expect(mounted.api.report.store).toHaveBeenCalledTimes(1)
        expect(mounted.api.report.addMembers).toHaveBeenCalledWith('r1', ['u2'])
        expect(mounted.store.report.pending).toBeNull()
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Report submitted', color: 'success' })
    })

    it('keeps the report success path when the assignment fails', async () => {
        stubCanvas()
        const mounted = mountComposerWithMembers()
        wrapper = mounted.wrapper
        mounted.api.report.addMembers.mockResolvedValue({
            ok: false,
            status: 422,
            data: { message: 'One or more user ids are unknown.' },
        })

        await submitComposer(mounted.wrapper, true)

        expect(mounted.api.report.store).toHaveBeenCalledTimes(1)
        expect(toastAdd).toHaveBeenCalledWith({ title: 'One or more user ids are unknown.', color: 'error' })
        expect(toastAdd).toHaveBeenCalledWith({ title: 'Report submitted', color: 'success' })
    })

    it('does not call the member endpoint when nothing is selected', async () => {
        stubCanvas()
        const mounted = mountComposerWithMembers()
        wrapper = mounted.wrapper

        await submitComposer(mounted.wrapper, false)

        expect(mounted.api.report.addMembers).not.toHaveBeenCalled()
        expect(mounted.api.report.store).toHaveBeenCalledTimes(1)
    })

    it('hides the members control for guests', () => {
        stubCanvas()
        wrapper = mountReport(['screenshots']).wrapper

        expect(wrapper.find('.members-picker-stub').exists()).toBe(false)
    })
})

describe('CreateReport priority', () => {
    it('submits the default Normal priority in the report payload', async () => {
        stubCanvas()
        const mounted = mountComposerWithMembers()
        wrapper = mounted.wrapper

        await submitComposer(mounted.wrapper, false)

        expect(mounted.api.report.store).toHaveBeenCalledWith(expect.objectContaining({ priority: 'normal' }))
    })

    it('updates the priority without closing the composer', async () => {
        stubCanvas()
        const mounted = mountComposerWithMembers()
        wrapper = mounted.wrapper

        await flushPromises()
        const high = wrapper.findAll('button').find(button => button.text().trim() === 'High')
        expect(high).toBeDefined()
        await high!.trigger('click')
        await nextTick()

        // Picking a priority must not tear down the reporting form.
        expect(wrapper.find('[data-component="create-report"]').exists()).toBe(true)
        expect(mounted.store.report.pending).not.toBeNull()

        await submitComposer(mounted.wrapper, false)
        expect(mounted.api.report.store).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }))
    })
})

/**
 * Regression guard: the nested priority popover opens inside the composer popover.
 * Reka's outside-pointerdown cannot see the inner layer across the widget's shadow
 * DOM, so the composer must become non-dismissible while the priority popover is
 * open, or the option click never commits. happy-dom cannot reproduce the shadow
 * layer detection, so the fix is pinned by asserting the dismissible wiring.
 */
describe('CreateReport priority popover dismissal wiring', () => {
    function composerDismissible(w: VueWrapper): string | undefined {
        return w.find('[data-component="create-report"]').attributes('data-dismissible')
    }

    it('locks composer dismissal while the priority popover is open, then commits the pick', async () => {
        stubCanvas()
        const { wrapper: w, api } = mountComposerWithMembers()
        wrapper = w
        await flushPromises()

        expect(composerDismissible(w)).toBe('true')

        const prioritySelect = w.findComponent(PrioritySelect)
        await prioritySelect.vm.$emit('update:open', true)
        await nextTick()
        expect(composerDismissible(w)).toBe('false')

        await prioritySelect.vm.$emit('update:open', false)
        await nextTick()
        expect(composerDismissible(w)).toBe('true')

        const critical = w.findAll('button').find(button => button.text().trim() === 'Critical')
        expect(critical).toBeDefined()
        await critical!.trigger('click')
        await nextTick()

        await submitComposer(w, false)
        expect(api.report.store).toHaveBeenCalledWith(expect.objectContaining({ priority: 'critical' }))
    })
})
