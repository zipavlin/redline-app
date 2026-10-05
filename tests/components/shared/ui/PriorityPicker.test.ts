import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PriorityPicker from '@/components/shared/ui/PriorityPicker.vue'

function mountPicker(props: { priority?: string; editable?: boolean; loading?: boolean } = {}) {
    return mount(PriorityPicker, {
        props,
        global: {
            // No store provided - the component takes the priority from its props.
            // Nuxt UI components stub by their own name (Badge/Button/Popover), not the U-prefixed tag.
            stubs: {
                Badge: {
                    template: '<span class="badge" :data-color="color" :data-variant="variant" :data-disabled="disabled">{{ label }}<slot /></span>',
                    props: ['label', 'color', 'variant', 'icon', 'size', 'as', 'disabled'],
                },
                Button: {
                    template: '<button class="option" :data-color="color" :data-variant="variant">{{ label }}<slot /></button>',
                    props: ['label', 'color', 'variant', 'icon', 'loading', 'size'],
                },
                Popover: {
                    template: '<div class="popover"><div class="popover-trigger"><slot /></div><div class="popover-content"><slot name="content" /></div></div>',
                },
            },
        },
    })
}

describe('PriorityPicker', () => {
    it('always renders the priority badge, including normal', () => {
        const wrapper = mountPicker({ priority: 'normal' })
        const badge = wrapper.find('.badge')
        expect(badge.exists()).toBe(true)
        expect(badge.text()).toContain('Normal')
    })

    it('renders no options when not editable', () => {
        const wrapper = mountPicker({ priority: 'high' })
        expect(wrapper.find('.popover-content').exists()).toBe(false)
        expect(wrapper.findAll('.option')).toHaveLength(0)
    })

    it('offers all four options when editable', () => {
        const wrapper = mountPicker({ priority: 'normal', editable: true })
        const options = wrapper.findAll('.option')
        expect(options.map(option => option.text())).toEqual(['Low', 'Normal', 'High', 'Critical'])
    })

    it('still shows the priority badge, with an accessible name, when editable', () => {
        const wrapper = mountPicker({ priority: 'high', editable: true })
        const badge = wrapper.find('.badge')
        expect(badge.text()).toContain('High')
        expect(badge.attributes('data-color')).toBe('warning')
        expect(badge.attributes('aria-label')).toBe('Priority: High')
    })

    it('highlights the current option', () => {
        const wrapper = mountPicker({ priority: 'high', editable: true })
        const variants = wrapper.findAll('.option').map(option => option.attributes('data-variant'))
        expect(variants).toEqual(['ghost', 'ghost', 'soft', 'ghost'])
    })

    it('emits change with the selected priority', async () => {
        const wrapper = mountPicker({ priority: 'normal', editable: true })
        const critical = wrapper.findAll('.option').find(option => option.text().includes('Critical'))
        await critical!.trigger('click')
        expect(wrapper.emitted('change')).toEqual([['critical']])
    })

    it('does not emit when the current priority is selected', async () => {
        const wrapper = mountPicker({ priority: 'normal', editable: true })
        const current = wrapper.findAll('.option').find(option => option.text().includes('Normal'))
        await current!.trigger('click')
        expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('falls back to the raw value and a neutral color for an unknown priority', () => {
        const wrapper = mountPicker({ priority: 'bogus' })
        const badge = wrapper.find('.badge')
        expect(badge.text()).toContain('bogus')
        expect(badge.attributes('data-color')).toBe('neutral')
    })

    it('marks the trigger disabled while loading', () => {
        const wrapper = mountPicker({ priority: 'normal', editable: true, loading: true })
        expect(wrapper.find('.badge').attributes('data-disabled')).toBe('true')
    })
})
