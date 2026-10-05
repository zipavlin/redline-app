import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrioritySelect from '@/components/shared/ui/PrioritySelect.vue'

interface SelectHandlers {
    onModelValue?: (value: string) => void
    onOpen?: (value: boolean) => void
}

function mountSelect(priority = 'normal', open = true, handlers: SelectHandlers = {}) {
    return mount(PrioritySelect, {
        props: {
            modelValue: priority,
            open,
            'onUpdate:modelValue': handlers.onModelValue ?? (() => {}),
            'onUpdate:open': handlers.onOpen ?? (() => {}),
        },
        global: {
            // Nuxt UI components stub by their own name (Popover/Button), not the U-prefixed tag.
            stubs: {
                Popover: {
                    template: '<div class="popover"><div class="popover-trigger"><slot /></div><div class="popover-content"><slot name="content" /></div></div>',
                },
                Button: {
                    props: ['label', 'color', 'variant', 'icon', 'size', 'trailingIcon', 'ariaLabel'],
                    template: '<button class="option" :data-variant="variant">{{ label }}<slot /></button>',
                },
            },
        },
    })
}

describe('PrioritySelect', () => {
    it('shows the current priority on the footer-styled trigger', () => {
        const wrapper = mountSelect('normal')
        expect(wrapper.find('.popover-trigger .option').text()).toContain('Normal')
    })

    it('offers all four options', () => {
        const wrapper = mountSelect()
        const options = wrapper.findAll('.popover-content .option')
        expect(options.map(option => option.text())).toEqual(['Low', 'Normal', 'High', 'Critical'])
    })

    it('highlights the current option', () => {
        const wrapper = mountSelect('high')
        const variants = wrapper.findAll('.popover-content .option').map(option => option.attributes('data-variant'))
        expect(variants).toEqual(['ghost', 'ghost', 'soft', 'ghost'])
    })

    it('selecting an option updates the model and closes only its popover', async () => {
        const onModelValue = vi.fn()
        const onOpen = vi.fn()
        const wrapper = mountSelect('normal', true, { onModelValue, onOpen })

        const high = wrapper.findAll('.popover-content .option').find(option => option.text().includes('High'))
        await high!.trigger('click')

        expect(onModelValue).toHaveBeenCalledWith('high')
        expect(onOpen).toHaveBeenCalledWith(false)
    })

    it('does not re-emit the model when the current priority is selected', async () => {
        const onModelValue = vi.fn()
        const onOpen = vi.fn()
        const wrapper = mountSelect('normal', true, { onModelValue, onOpen })

        const current = wrapper.findAll('.popover-content .option').find(option => option.text().includes('Normal'))
        await current!.trigger('click')

        expect(onModelValue).not.toHaveBeenCalled()
        expect(onOpen).toHaveBeenCalledWith(false)
    })
})
