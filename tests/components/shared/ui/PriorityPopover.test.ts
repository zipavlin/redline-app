import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * Nuxt UI components are auto-imported by unplugin-vue-components, so VTU cannot
 * stub them by name - each is module-mocked at its package subpath with a
 * minimal stand-in (same convention as tests/support/auth.ts).
 */
vi.mock('@nuxt/ui/components/Popover.vue', () => ({
    default: {
        name: 'UPopover',
        props: {
            open: { type: Boolean, default: false },
            content: { type: Object, default: undefined },
            arrow: { type: Boolean, default: false },
        },
        emits: ['update:open'],
        template: '<div class="popover"><div class="popover-trigger"><slot /></div><div class="popover-content"><slot name="content" /></div></div>',
    },
}))
vi.mock('@nuxt/ui/components/Tooltip.vue', () => ({
    default: {
        name: 'UTooltip',
        props: ['text', 'arrow'],
        template: '<span class="u-tooltip" :data-text="text"><slot /></span>',
    },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['label', 'color', 'variant', 'icon', 'size', 'square', 'ariaLabel'],
        emits: ['click'],
        template: '<button class="option" :data-color="color" :data-variant="variant" :data-icon="icon" :aria-label="ariaLabel" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
    },
}))

import PriorityPopover from '@/components/shared/report/PriorityPopover.vue'

function mountPopover(priority = 'normal') {
    return mount(PriorityPopover, { props: { modelValue: priority, open: true } })
}

function contentOptions(wrapper: ReturnType<typeof mountPopover>) {
    return wrapper.findAll('.popover-content .option')
}

describe('PriorityPopover', () => {
    // The real trigger is an icon-only flag button; "which priority is current" is
    // carried by its accessible name and the tooltip, not by visible text.
    it('shows the current priority on the footer trigger', () => {
        const wrapper = mountPopover('high')
        const trigger = wrapper.find('.popover-trigger .option')

        expect(trigger.attributes('data-icon')).toBe('i-lucide-flag')
        expect(trigger.attributes('aria-label')).toBe('Priority: high')
        expect(wrapper.findComponent({ name: 'UTooltip' }).props('text')).toBe('Priority: high')
    })

    it('colors the footer trigger by the current priority', () => {
        expect(mountPopover('critical').find('.popover-trigger .option').attributes('data-color')).toBe('error')
        expect(mountPopover('normal').find('.popover-trigger .option').attributes('data-color')).toBe('info')
    })

    it('offers all four options', () => {
        expect(contentOptions(mountPopover()).map(option => option.text()))
            .toEqual(['Low', 'Normal', 'High', 'Critical'])
    })

    it('highlights the current option and ghosts the rest', () => {
        const variants = contentOptions(mountPopover('high')).map(option => option.attributes('data-variant'))

        expect(variants).toEqual(['ghost', 'ghost', 'soft', 'ghost'])
    })

    it('selecting an option updates the model and closes only its popover', async () => {
        const wrapper = mountPopover('normal')

        const high = contentOptions(wrapper).find(option => option.text().includes('High'))
        await high!.trigger('click')

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['high'])
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('does not re-emit the model when the current priority is selected', async () => {
        const wrapper = mountPopover('normal')

        const current = contentOptions(wrapper).find(option => option.text().includes('Normal'))
        await current!.trigger('click')

        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })
})
