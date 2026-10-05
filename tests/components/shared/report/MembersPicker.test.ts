import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Member } from '@/resources/report/model'

/**
 * Nuxt UI components are auto-imported by unplugin-vue-components, so VTU cannot
 * stub them by name - each is module-mocked at its package subpath with a
 * minimal stand-in (same convention as tests/support/auth.ts).
 */
vi.mock('@nuxt/ui/components/Input.vue', () => ({
    default: {
        name: 'UInput',
        props: ['modelValue', 'placeholder', 'size', 'icon', 'autofocus'],
        emits: ['update:modelValue'],
        template: '<input class="u-input" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
}))
vi.mock('@nuxt/ui/components/Avatar.vue', () => ({
    default: {
        name: 'UAvatar',
        props: ['alt', 'icon', 'size', 'ui'],
        template: '<span class="u-avatar">{{ alt || icon }}</span>',
    },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['icon', 'label', 'size', 'variant', 'color', 'square', 'disabled', 'ariaLabel', 'ui'],
        emits: ['click'],
        template: '<button class="u-button" :aria-label="ariaLabel" :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>',
    },
}))
vi.mock('@nuxt/ui/components/Icon.vue', () => ({
    default: {
        name: 'UIcon',
        props: ['name'],
        template: '<i class="u-icon" :data-icon="name" />',
    },
}))

import MembersPicker from '@/components/shared/report/MembersPicker.vue'

const amy: Member = { id: 'u1', name: 'Amy Alpha', initials: 'AA' }
const zoe: Member = { id: 'u2', name: 'Zoe Dev', initials: 'ZD' }

function mountPicker(props: Partial<InstanceType<typeof MembersPicker>['$props']> = {}) {
    return mount(MembersPicker, {
        props: { members: [amy], candidates: [zoe], canEdit: true, ...props },
    })
}

describe('MembersPicker', () => {
    it('renders the report members and all members sections', () => {
        const wrapper = mountPicker()

        expect(wrapper.text()).toContain('Report members')
        expect(wrapper.text()).toContain('All members')
        expect(wrapper.text()).toContain('Amy Alpha')
        expect(wrapper.text()).toContain('Zoe Dev')
    })

    it('filters both sections by the search query', async () => {
        const wrapper = mountPicker()

        await wrapper.find('input').setValue('zoe')

        expect(wrapper.text()).toContain('All members')
        expect(wrapper.text()).not.toContain('Report members')
        expect(wrapper.text()).not.toContain('Amy Alpha')
        expect(wrapper.text()).toContain('Zoe Dev')
    })

    it('emits add when a candidate row is clicked', async () => {
        const wrapper = mountPicker()

        const candidate = wrapper.findAll('button').find(button => button.text().includes('Zoe Dev'))
        await candidate!.trigger('click')

        expect(wrapper.emitted('add')).toEqual([[zoe]])
    })

    it('emits remove when a member row remove button is clicked', async () => {
        const wrapper = mountPicker()

        await wrapper.find('button[aria-label="Remove Amy Alpha"]').trigger('click')

        expect(wrapper.emitted('remove')).toEqual([[amy]])
    })

    it('hides the remove buttons and the candidates section when read-only', () => {
        const wrapper = mountPicker({ canEdit: false })

        expect(wrapper.text()).toContain('Report members')
        expect(wrapper.text()).toContain('Amy Alpha')
        expect(wrapper.text()).not.toContain('All members')
        expect(wrapper.find('button[aria-label="Remove Amy Alpha"]').exists()).toBe(false)
    })

    it('shows an empty state when there is nothing to show', () => {
        const wrapper = mountPicker({ members: [], candidates: [] })

        expect(wrapper.text()).toContain('No members found')
    })
})

describe('MembersPicker author exclusion', () => {
    it('never offers the report author as a candidate to add', () => {
        // The author is never a member (the server drops them), so the picker must
        // not show them in "All members" of their own report.
        const wrapper = mountPicker({ members: [], candidates: [amy, zoe], authorId: amy.id })

        expect(wrapper.text()).toContain('Zoe Dev')
        expect(wrapper.text()).not.toContain('Amy Alpha')
    })

    it('leaves the candidates untouched when no authorId is given', () => {
        const wrapper = mountPicker({ members: [], candidates: [amy, zoe] })

        expect(wrapper.text()).toContain('Amy Alpha')
        expect(wrapper.text()).toContain('Zoe Dev')
    })

    it('does not filter the displayed members list by authorId', () => {
        // Defensive: even if the server ever echoed the author in `members`, the
        // picker must not silently drop a server-owned row.
        const wrapper = mountPicker({ members: [amy], candidates: [zoe], authorId: amy.id })

        expect(wrapper.text()).toContain('Report members')
        expect(wrapper.text()).toContain('Amy Alpha')
    })
})
