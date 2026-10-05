import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * The auto-imported Nuxt UI components resolve to their real SFCs (unplugin), so
 * they are module-mocked at their package subpaths - name-based `global.stubs` do
 * not match locally imported components. Mirrors the convention in
 * tests/components/shared/report/MembersPicker.test.ts. The UButton stub exposes
 * `data-color`/`data-icon` so the direction-aware wiring can be asserted.
 */
vi.mock('@nuxt/ui/components/FieldGroup.vue', () => ({
    default: { name: 'UFieldGroup', template: '<div><slot /></div>' },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['label', 'color', 'variant', 'icon', 'loading', 'size'],
        emits: ['click'],
        template: '<button @click="$emit(\'click\')" :data-color="color" :data-icon="icon"><slot />{{ label }}</button>',
    },
}))
vi.mock('@nuxt/ui/components/Popover.vue', () => ({
    default: {
        name: 'UPopover',
        props: ['open', 'content'],
        emits: ['update:open'],
        template: '<div class="popover"><slot /><div class="popover-content"><slot name="content" /></div></div>',
    },
}))

import StatusChanger from '@/components/shared/ui/StatusChanger.vue'

function mountChanger(props: { status?: string; loading?: boolean; role?: string | null; authorized?: boolean } = {}) {
    // No store provided - the component must take the role from its props.
    return mount(StatusChanger, { props })
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

    it('shows "Notice" as next from new (developer) - direction-aware', () => {
        // Deliberate change (direction-aware): new -> noticed is a forward step, so
        // it reads "Notice". The old target-only meta reused noticed.action "Reopen".
        const wrapper = mountChanger({ status: 'new', role: 'developer' })
        expect(wrapper.text()).toContain('Notice')
    })

    it('shows dropdown when developer at noticed has multiple targets', () => {
        const wrapper = mountChanger({ status: 'noticed', role: 'developer' })
        const buttons = wrapper.findAll('button')
        expect(buttons.length).toBeGreaterThanOrEqual(2)
    })

    it('shows "Rollback" as the rewind from resolved (developer only has progress)', () => {
        // Deliberate change (direction-aware): resolved -> progress rewinds, so it
        // reads "Rollback" (warning) - the move back to work, not the target's forward action.
        const wrapper = mountChanger({ status: 'resolved', role: 'developer' })
        expect(wrapper.text()).toContain('Rollback')
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

    it('renders nothing when not authorized, even with an otherwise valid role', () => {
        const wrapper = mountChanger({ status: 'new', role: 'developer', authorized: false })
        expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders for an authorized caller when the prop is omitted (default true)', () => {
        const wrapper = mountChanger({ status: 'new', role: 'developer' })
        expect(wrapper.find('button').exists()).toBe(true)
    })
})

describe('StatusChanger direction-aware actions', () => {
    it('uses the direction-aware label/icon/color on the primary button', () => {
        const wrapper = mountChanger({ status: 'new', role: 'developer' })
        const primary = wrapper.findAll('button')[0]
        expect(primary.text()).toContain('Notice')
        expect(primary.attributes('data-icon')).toBe('i-lucide-eye')
        expect(primary.attributes('data-color')).toBe('success')
    })

    it('paints a rewind (Rollback) primary button warning', () => {
        const wrapper = mountChanger({ status: 'resolved', role: 'developer' })
        const primary = wrapper.findAll('button')[0]
        expect(primary.text()).toContain('Rollback')
        expect(primary.attributes('data-color')).toBe('warning')
        expect(primary.attributes('data-icon')).toBe('i-lucide-rotate-ccw')
    })

    it('paints a forward primary button success', () => {
        const wrapper = mountChanger({ status: 'progress', role: 'developer' })
        const primary = wrapper.findAll('button')[0]
        expect(primary.text()).toContain('Resolve')
        expect(primary.attributes('data-color')).toBe('success')
    })

    it('renders the dropdown targets with direction-aware labels and colors', () => {
        // noticed (developer): primary = closest forward (progress -> Claim);
        // the remaining resolved target is the dropdown row.
        const wrapper = mountChanger({ status: 'noticed', role: 'developer' })
        const buttons = wrapper.findAll('button')
        expect(buttons[0].text()).toContain('Claim')

        const resolve = buttons.find(button => button.text().includes('Resolve'))
        expect(resolve).toBeDefined()
        expect(resolve!.attributes('data-color')).toBe('success')
    })

    it('paints a rewind dropdown target warning', () => {
        // progress (developer): primary = resolved (Resolve); the noticed target
        // in the dropdown releases the claim and must read Release/warning.
        const wrapper = mountChanger({ status: 'progress', role: 'developer' })
        const release = wrapper.findAll('button').find(button => button.text().includes('Release'))
        expect(release).toBeDefined()
        expect(release!.attributes('data-color')).toBe('warning')
        expect(release!.attributes('data-icon')).toBe('i-lucide-undo-2')
    })

    it('pairs the chevron trigger color with the primary button', () => {
        const wrapper = mountChanger({ status: 'resolved', role: 'developer' })
        const buttons = wrapper.findAll('button')
        expect(buttons[0].text()).toContain('Rollback')
        expect(buttons[0].attributes('data-color')).toBe('warning')
        // The chevron is the UPopover trigger (second button) and must match.
        expect(buttons[1].attributes('data-color')).toBe('warning')
    })

    it('emits change with the selected dropdown target', async () => {
        const wrapper = mountChanger({ status: 'noticed', role: 'developer' })
        const resolve = wrapper.findAll('button').find(button => button.text().includes('Resolve'))
        await resolve!.trigger('click')
        expect(wrapper.emitted('change')).toEqual([['resolved']])
    })
})
