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
vi.mock('@nuxt/ui/components/Badge.vue', () => ({
    default: {
        name: 'UBadge',
        props: ['label', 'color', 'variant', 'icon', 'size', 'as', 'type', 'disabled', 'ariaLabel'],
        template: '<span class="badge" :data-color="color" :data-variant="variant" :data-icon="icon" :data-disabled="disabled ? \'true\' : undefined" :aria-label="ariaLabel">{{ label }}<slot /></span>',
    },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['label', 'color', 'variant', 'icon', 'size'],
        emits: ['click'],
        template: '<button class="option" :data-color="color" :data-variant="variant" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
    },
}))

import PriorityBadge from '@/components/shared/report/PriorityBadge.vue'

interface BadgeProps {
    priority?: string
    editable?: boolean
    loading?: boolean
}

function mountBadge(props: BadgeProps = {}) {
    return mount(PriorityBadge, { props })
}

describe('PriorityBadge', () => {
    it('always renders the priority badge, including normal', () => {
        const badge = mountBadge({ priority: 'normal' }).find('.badge')

        expect(badge.exists()).toBe(true)
        expect(badge.text()).toContain('Normal')
    })

    it('renders no options when not editable', () => {
        const wrapper = mountBadge({ priority: 'high' })

        expect(wrapper.find('.popover-content').exists()).toBe(false)
        expect(wrapper.findAll('.option')).toHaveLength(0)
    })

    it('offers all four options when editable', () => {
        const options = mountBadge({ priority: 'normal', editable: true }).findAll('.option')

        expect(options.map(option => option.text())).toEqual(['Low', 'Normal', 'High', 'Critical'])
    })

    it('still shows the priority badge, with an accessible name, when editable', () => {
        const badge = mountBadge({ priority: 'high', editable: true }).find('.badge')

        expect(badge.text()).toContain('High')
        expect(badge.attributes('data-color')).toBe('warning')
        expect(badge.attributes('aria-label')).toBe('Priority: High')
    })

    it('highlights the current option and ghosts the rest', () => {
        const variants = mountBadge({ priority: 'high', editable: true })
            .findAll('.option').map(option => option.attributes('data-variant'))

        expect(variants).toEqual(['ghost', 'ghost', 'soft', 'ghost'])
    })

    it('emits change with the selected priority', async () => {
        const wrapper = mountBadge({ priority: 'normal', editable: true })

        const critical = wrapper.findAll('.option').find(option => option.text().includes('Critical'))
        await critical!.trigger('click')

        expect(wrapper.emitted('change')).toEqual([['critical']])
    })

    it('does not emit when the current priority is selected', async () => {
        const wrapper = mountBadge({ priority: 'normal', editable: true })

        const current = wrapper.findAll('.option').find(option => option.text().includes('Normal'))
        await current!.trigger('click')

        expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('falls back to the raw value and a neutral color for an unknown priority', () => {
        const badge = mountBadge({ priority: 'bogus' }).find('.badge')

        expect(badge.text()).toContain('bogus')
        expect(badge.attributes('data-color')).toBe('neutral')
    })

    it('marks the trigger disabled while loading', () => {
        const badge = mountBadge({ priority: 'normal', editable: true, loading: true }).find('.badge')

        expect(badge.attributes('data-disabled')).toBe('true')
    })
})
