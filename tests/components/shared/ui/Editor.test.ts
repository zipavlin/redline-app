import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const { capturedEditorProps } = vi.hoisted(() => ({
    capturedEditorProps: {
        value: undefined as { handlePaste?: (view: unknown, event: unknown) => boolean } | undefined,
    },
}))

/**
 * The auto-imported Nuxt UI editor components resolve to their real SFCs (unplugin),
 * so they are module-mocked instead of name-stubbed. The glue under test is the
 * shared Editor.vue itself: UEditor only needs to capture the :editor-props object
 * (no real TipTap mount), and the suggestion menu / toolbar stubs keep the render tree minimal.
 */
vi.mock('@nuxt/ui/components/Editor.vue', () => ({
    default: {
        name: 'UEditorStub',
        props: ['editorProps'],
        setup(props: { editorProps: { handlePaste?: (view: unknown, event: unknown) => boolean } }) {
            capturedEditorProps.value = props.editorProps
        },
        template: '<div class="ueditor-stub"><slot :editor="{}" :handlers="{}" /></div>',
    },
}))
vi.mock('@nuxt/ui/components/EditorSuggestionMenu.vue', () => ({
    default: { name: 'UEditorSuggestionMenuStub', template: '<div class="ueditor-suggestion-menu-stub" />' },
}))
vi.mock('@nuxt/ui/components/EditorMentionMenu.vue', () => ({
    default: {
        name: 'UEditorMentionMenuStub',
        props: ['editor', 'items', 'ignoreFilter', 'limit', 'appendTo', 'pluginKey'],
        emits: ['update:searchTerm'],
        template: '<div class="ueditor-mention-menu-stub" />',
    },
}))
vi.mock('@nuxt/ui/components/EditorToolbar.vue', () => ({
    default: { name: 'UEditorToolbarStub', template: '<div class="ueditor-toolbar-stub" />' },
}))

import Editor from '@/components/shared/ui/Editor.vue'

function imagePasteEvent(): { clipboardData: { items: DataTransferItem[] } } {
    const file = new File(['png-bytes'], 'shot.png', { type: 'image/png' })
    return {
        clipboardData: {
            items: [{
                kind: 'file',
                type: 'image/png',
                getAsFile: () => file,
            } as DataTransferItem],
        },
    }
}

function textPasteEvent(): { clipboardData: { items: DataTransferItem[] } } {
    return {
        clipboardData: {
            items: [{
                kind: 'string',
                type: 'text/plain',
                getAsFile: () => null,
            } as DataTransferItem],
        },
    }
}

function paste(event: { clipboardData: { items: DataTransferItem[] } }): boolean {
    const handlePaste = capturedEditorProps.value!.handlePaste!
    return handlePaste({} as never, event as never)
}

interface EditorUser {
    id: string
    name: string
    email: string
    role: string
}

/**
 * The real Editor now resolves the store + mention-search api, so every mount
 * provides both (the api returns no users - the menu is never opened here).
 */
function mountEditor(options: { props?: Record<string, unknown>; user?: EditorUser | null } = {}) {
    return mount(Editor, {
        props: options.props,
        global: {
            provide: {
                redline: {
                    api: {
                        user: {
                            index: vi.fn().mockResolvedValue({ ok: true, status: 200, data: { data: [] } }),
                        },
                    },
                    config: {},
                },
                store: {
                    auth: { user: options.user ?? null, callback: null, authView: 'login' },
                    activateSession: () => {},
                },
            },
        },
    })
}

const reporter: EditorUser = { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'reporter' }

describe('Editor clipboard-image paste glue', () => {
    it('falls through (returns false) for an image paste when no handleImagePaste prop is set', () => {
        mountEditor()

        expect(paste(imagePasteEvent())).toBe(false)
    })

    it('returns true when the handler accepts the paste', () => {
        const handler = vi.fn(() => undefined)
        mountEditor({ props: { handleImagePaste: handler } })

        expect(paste(imagePasteEvent())).toBe(true)
        expect(handler).toHaveBeenCalledWith(expect.any(File))
    })

    it('returns false when the handler explicitly rejects the paste', () => {
        const handler = vi.fn(() => false)
        mountEditor({ props: { handleImagePaste: handler } })

        expect(paste(imagePasteEvent())).toBe(false)
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('falls through (returns false) for a text-only paste even with a handler set', () => {
        const handler = vi.fn()
        mountEditor({ props: { handleImagePaste: handler } })

        expect(paste(textPasteEvent())).toBe(false)
        expect(handler).not.toHaveBeenCalled()
    })
})

describe('Editor mention menu', () => {
    it('renders the mention menu for an authenticated user', () => {
        const wrapper = mountEditor({ user: reporter })

        expect(wrapper.find('.ueditor-mention-menu-stub').exists()).toBe(true)
    })

    it('does not render the mention menu for a guest', () => {
        const wrapper = mountEditor()

        expect(wrapper.find('.ueditor-mention-menu-stub').exists()).toBe(false)
    })

    it('does not render the mention menu when the mention prop is disabled', () => {
        const wrapper = mountEditor({ props: { mention: false }, user: reporter })

        expect(wrapper.find('.ueditor-mention-menu-stub').exists()).toBe(false)
    })
})
