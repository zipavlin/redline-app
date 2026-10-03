import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import UEditor from '@nuxt/ui/components/Editor.vue'

/**
 * Regression guard for the disputed C2 review claim: Nuxt UI's `UEditor` is
 * expected to drop per-node `data-id`/`data-label` because its `renderHTML`
 * (Editor.vue:141-147) merges only `{"data-type":"mention"}` with
 * `options.HTMLAttributes`. In fact the TipTap Mention extension folds the
 * per-node HTMLAttributes into `mergedOptions.HTMLAttributes` *before* calling
 * our `renderHTML` (extension-mention renderHTML ~157-176), so the attributes
 * survive. This test mounts the real `UEditor` - exactly the one our shared
 * `Editor.vue` renders - and asserts the round-trip so the behaviour can never
 * silently regress.
 */
async function mountEditor(): Promise<Editor> {
    let editor: Editor | undefined
    mount(UEditor, {
        attachTo: document.body,
        props: { modelValue: '' },
        slots: {
            default: (slotProps: { editor?: Editor }) => {
                editor = slotProps.editor
                return null
            },
        },
    })
    await flushPromises()
    if (!editor) throw new Error('UEditor slot did not expose an editor instance')
    return editor
}

describe('UEditor mention round-trip', () => {
    it('serializes a mention node with its data-id and data-label', async () => {
        const editor = await mountEditor()

        editor.commands.insertContent({ type: 'mention', attrs: { id: 'u1', label: 'Ada' } })

        const html = editor.getHTML()
        expect(html).toContain('data-id="u1"')
        expect(html).toContain('data-label="Ada"')
        expect(html).toContain('@Ada')
    })
})
