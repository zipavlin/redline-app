import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusChanger from '@/components/shared/ui/StatusChanger.vue'

function mountChanger(props: { status?: string; loading?: boolean; role?: string | null } = {}) {
    return mount(StatusChanger, {
        props,
        global: {
            // No store provided — the component must take the role from its props.
            stubs: {
                UFieldGroup: { template: '<div><slot /></div>' },
                UButton: {
                    template: '<button @click="$emit(\'click\')"><slot />{{ label }}</button>',
                    props: ['label', 'color', 'variant', 'icon', 'loading', 'size'],
                },
                UPopover: {
                    template: '<div class="popover"><slot /><div class="popover-content"><slot name="content" /></div></div>',
                    props: ['content', 'modelValue'],
                    emits: ['update:modelValue'],
                },
            },
        },
    })
}

describe('StatusChanger', () => {
    it('renders nothing when no status', () => {
        const wrapper = mountChanger({ role: 'developer' })
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders nothing when role is null (no user)', () => {
        const wrapper = mountChanger({ status: 'new', role: null })
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders nothing when role is missing (prop omitted)', () => {
        const wrapper = mountChanger({ status: 'new' })
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('shows "Reopen" as next from new (developer) — action for noticed', () => {
        const wrapper = mountChanger({ status: 'new', role: 'developer' })
        expect(wrapper.text()).toContain('Reopen')
    })

    it('shows dropdown when developer at noticed has multiple targets', () => {
        const wrapper = mountChanger({ status: 'noticed', role: 'developer' })
        const buttons = wrapper.findAll('button')
        expect(buttons.length).toBeGreaterThanOrEqual(2)
    })

    it('shows "Accept" as re-open from resolved (developer only has progress)', () => {
        const wrapper = mountChanger({ status: 'resolved', role: 'developer' })
        expect(wrapper.text()).toContain('Accept')
    })

    it('shows "Close" as next from resolved (reporter)', () => {
        const wrapper = mountChanger({ status: 'resolved', role: 'reporter' })
        const buttons = wrapper.findAll('button')
        expect(buttons[0].text()).toContain('Close')
    })

    it('emits change when primary button clicked', async () => {
        const wrapper = mountChanger({ status: 'new', role: 'developer' })
        await wrapper.find('button').trigger('click')
        expect(wrapper.emitted('change')).toEqual([['noticed']])
    })

    it('no dropdown when reporter at noticed has only one target', () => {
        const wrapper = mountChanger({ status: 'noticed', role: 'reporter' })
        const buttons = wrapper.findAll('button')
        expect(buttons.length).toBe(1)
    })

    it('renders nothing for guest', () => {
        const wrapper = mountChanger({ status: 'new', role: 'guest' })
        expect(wrapper.find('button').exists()).toBe(false)
    })
})
