import { describe, it, expect } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { isHtmlEmpty } from '@/core/text'
import InlineEditor from '@/components/shared/ui/InlineEditor.vue'

// Faithful stub of the shared Editor: v-model HTML string + exposed isEmpty
// (same contract as the real Editor.vue, without the TipTap machinery).
const EditorStub = defineComponent({
    name: 'Editor',
    props: ['modelValue', 'placeholder', 'loading', 'autofocus'],
    emits: ['update:modelValue', 'submit'],
    setup(props, { expose, emit }) {
        const isEmpty = computed(() => isHtmlEmpty(String(props.modelValue ?? '')))
        expose({ isEmpty })
        return () =>
            h('div', { class: 'editor-stub' }, [
                h('input', {
                    class: 'editor-input',
                    value: props.modelValue ?? '',
                    onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
                }),
            ])
    },
})

const UButtonStub = {
    name: 'UButton',
    props: ['label', 'icon', 'size', 'variant', 'square', 'loading', 'disabled', 'color', 'ariaLabel'],
    emits: ['click'],
    template:
        '<button :disabled="disabled || loading" :aria-label="ariaLabel || label" @click="$emit(\'click\')"><slot />{{ label }}</button>',
}

async function mountEditor(props: { initial?: string; loading?: boolean } = {}) {
    const wrapper = mount(InlineEditor, {
        props,
        global: { stubs: { Editor: EditorStub, UButton: UButtonStub } },
    })
    // The editor exposes `isEmpty` via template ref only after the child mounts;
    // flush a tick so the save button's disabled state reflects the initial content.
    await nextTick()
    return wrapper
}

type EditorWrapper = Awaited<ReturnType<typeof mountEditor>>

const saveButton = (wrapper: EditorWrapper) => wrapper.find('[aria-label="Save changes"]')
const cancelButton = (wrapper: EditorWrapper) => wrapper.find('[aria-label="Cancel editing"]')

describe('InlineEditor', () => {
    it('renders the cancel button', async () => {
        const wrapper = await mountEditor({ initial: '<p>Hello</p>' })
        expect(cancelButton(wrapper).exists()).toBe(true)
    })

    it('prepopulates the editor with the initial HTML on mount', async () => {
        const wrapper = await mountEditor({ initial: '<p>Hello</p>' })
        const input = wrapper.find('.editor-input').element as HTMLInputElement
        expect(input.value).toBe('<p>Hello</p>')
    })

    it('disables save when the editor is empty', async () => {
        const wrapper = await mountEditor({ initial: '' })
        expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    })

    it('enables save reactively once content is present', async () => {
        const wrapper = await mountEditor({ initial: '' })
        expect(saveButton(wrapper).attributes('disabled')).toBeDefined()

        await wrapper.find('.editor-input').setValue('<p>typed</p>')
        expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()

        await saveButton(wrapper).trigger('click')
        expect(wrapper.emitted('save')).toEqual([['<p>typed</p>']])
    })

    it('does not emit save when empty even if the button is clicked', async () => {
        const wrapper = await mountEditor({ initial: '' })
        await saveButton(wrapper).trigger('click')
        expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('emits save with the current html on save click', async () => {
        const wrapper = await mountEditor({ initial: '<p>Hello</p>' })
        await saveButton(wrapper).trigger('click')
        expect(wrapper.emitted('save')).toEqual([['<p>Hello</p>']])
    })

    it('cancel emits cancel without save', async () => {
        const wrapper = await mountEditor({ initial: '<p>Hello</p>' })
        await cancelButton(wrapper).trigger('click')
        expect(wrapper.emitted('cancel')).toHaveLength(1)
        expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('blocks cancel while loading', async () => {
        const wrapper = await mountEditor({ initial: '<p>Hello</p>', loading: true })
        await cancelButton(wrapper).trigger('click')
        expect(wrapper.emitted('cancel')).toBeUndefined()
    })
})
