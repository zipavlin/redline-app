import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    default: { name: 'UPopoverStub', template: '<div class="popover-stub"><slot name="content" /></div>' },
}))
vi.mock('@nuxt/ui/components/ChatPrompt.vue', () => ({
    default: { name: 'UChatPromptStub', template: '<div class="chat-prompt-stub"><slot name="body" /></div>' },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: { name: 'UButtonStub', template: '<button class="u-button-stub"><slot /></button>' },
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

function makeStore(features: string[] = ['screenshots']) {
    return {
        auth: { user: null, callback: null, authView: 'login' },
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

function mountReport(features: string[] = ['screenshots']) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const store = makeStore(features)
    const wrapper = mount(CreateReport, {
        global: {
            plugins: [[VueQueryPlugin, { queryClient }]],
            provide: {
                redline: { api: {}, config: {} },
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
