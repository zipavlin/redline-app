import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Member } from '@/resources/report/model'

const { toastAdd, mockStore, setUser, setReport } = vi.hoisted(() => {
    const store: {
        auth: { user: unknown; callback: null; authView: string }
        activateSession: () => void
        report: { active: unknown; list: unknown[] }
    } = {
        auth: { user: null, callback: null, authView: 'login' },
        activateSession: () => {},
        report: { active: null, list: [] },
    }
    return {
        toastAdd: vi.fn(),
        mockStore: store,
        setUser: (user: unknown) => { store.auth.user = user },
        setReport: (active: unknown, list: unknown[]) => { store.report.active = active; store.report.list = list },
    }
})

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@/composables/useStore', () => ({ useStore: () => mockStore }))

// Minimal stand-ins for the auto-imported Nuxt UI components.
vi.mock('@nuxt/ui/components/Popover.vue', () => ({
    default: {
        name: 'UPopover',
        props: {
            open: { type: Boolean, default: false },
            dismissible: { type: Boolean, default: true },
            content: { type: Object, default: undefined },
            arrow: { type: Boolean, default: false },
        },
        emits: ['update:open'],
        methods: {
            close() { (this as unknown as { $emit: (e: string, v: boolean) => void }).$emit('update:open', false) },
        },
        template: `
            <div class="u-popover" :data-open="String(open)">
                <slot :open="open" />
                <div v-if="open" class="u-popover-content">
                    <slot name="content" :close="close" />
                </div>
            </div>`,
    },
}))
vi.mock('@nuxt/ui/components/Tooltip.vue', () => ({
    default: { name: 'UTooltip', props: ['text', 'arrow'], template: '<span class="u-tooltip"><slot /></span>' },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['icon', 'label', 'size', 'variant', 'color', 'square', 'disabled', 'ariaLabel', 'ui'],
        emits: ['click'],
        template: '<button class="u-button" :aria-label="ariaLabel" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
    },
}))
vi.mock('@nuxt/ui/components/AvatarGroup.vue', () => ({
    default: { name: 'UAvatarGroup', props: ['size', 'max'], template: '<span class="u-avatar-group"><slot /></span>' },
}))
vi.mock('@nuxt/ui/components/Avatar.vue', () => ({
    default: {
        name: 'UAvatar',
        props: ['alt', 'icon', 'size', 'ui'],
        template: '<span class="u-avatar" :data-icon="icon">{{ alt }}</span>',
    },
}))
vi.mock('@/components/shared/report/MembersPicker.vue', () => ({
    default: {
        name: 'MembersPicker',
        props: ['members', 'candidates', 'canEdit', 'loading'],
        emits: ['add', 'remove'],
        template: `
            <div class="members-picker-stub" :data-can-edit="String(canEdit)">
                <template v-if="canEdit">
                    <button
                        v-for="candidate in candidates"
                        :key="candidate.id"
                        class="mp-add"
                        :data-id="candidate.id"
                        @click="$emit('add', candidate)"
                    >{{ candidate.name }}</button>
                    <button
                        v-for="member in members"
                        :key="'m-' + member.id"
                        class="mp-remove"
                        :data-id="member.id"
                        @click="$emit('remove', member)"
                    >{{ member.name }}</button>
                </template>
            </div>`,
    },
}))

import MemberPopover from '@/components/shared/report/MemberPopover.vue'

const amy: Member = { id: 'u1', name: 'Amy Alpha', initials: 'AA' }
const zoe: Member = { id: 'u2', name: 'Zoe Dev', initials: 'ZD' }
const liz: Member = { id: 'u3', name: 'Liz Lane', initials: 'LL' }

function userList(rows: { id: string; status?: string; created_at?: string; name?: string; initials?: string }[]) {
    return {
        data: rows.map(row => ({ status: 'approved', created_at: '2026-01-01T00:00:00Z', ...row })),
        meta: { total: rows.length, per_page: 16, current_page: 1, last_page: 1 },
        counts: { all: rows.length, active: rows.length, pending: 0 },
    }
}

interface MembersProps {
    reportId?: string
    members?: Member[]
    canEdit?: boolean
    memberIds?: string[]
    placement?: 'bottom-end' | 'top-start'
    size?: 'xs' | 'sm'
}

function mountMembers(props: MembersProps = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = {
        user: { index: vi.fn() },
        report: { addMembers: vi.fn(), removeMembers: vi.fn() },
    }
    const wrapper = mount(MemberPopover, {
        props: { reportId: 'r1', members: [], canEdit: true, ...props },
        global: {
            plugins: [[VueQueryPlugin, { queryClient }]],
            provide: { redline: { api, config: {} } },
        },
    })
    return { wrapper, api, queryClient }
}

async function openPopover(wrapper: VueWrapper) {
    wrapper.findComponent({ name: 'UPopover' }).vm.$emit('update:open', true)
    await nextTick()
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
    toastAdd.mockClear()
    setUser({ id: 'me', name: 'Me Myself', role: 'reporter' })
    setReport(null, [])
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
})

describe('MemberPopover trigger', () => {
    it('shows a dashed placeholder avatar when there are no members', () => {
        wrapper = mountMembers().wrapper

        expect(wrapper.find('.u-avatar[data-icon="i-lucide-user-plus"]').exists()).toBe(true)
        expect(wrapper.find('.u-avatar-group').exists()).toBe(false)
    })

    it('renders the member stack with size 2xs and max 3', () => {
        wrapper = mountMembers({ members: [amy, zoe, liz] }).wrapper

        expect(wrapper.findAll('.u-avatar')).toHaveLength(3)
        const group = wrapper.findComponent({ name: 'UAvatarGroup' })
        expect(group.props('size')).toBe('2xs')
        expect(group.props('max')).toBe(3)
    })
})

describe('MemberPopover draft mode', () => {
    it('resolves a selected id to the current user before candidates return', async () => {
        const mounted = mountMembers({ reportId: undefined, memberIds: ['me'] })
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: false, status: 403, data: null })

        await openPopover(wrapper)
        await flushPromises()

        expect(wrapper.findComponent({ name: 'MembersPicker' }).props('members')).toEqual([
            { id: 'me', name: 'Me Myself', initials: 'MM' },
        ])
    })

    it('excludes already-picked members from the candidates', async () => {
        const mounted = mountMembers({ reportId: undefined, memberIds: ['u1'] })
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: true, status: 200, data: userList([amy, zoe]) })

        await openPopover(wrapper)
        await flushPromises()

        expect(wrapper.find('.mp-add[data-id="u1"]').exists()).toBe(false)
        expect(wrapper.find('.mp-add[data-id="u2"]').exists()).toBe(true)
    })

    it('emits updated ids when adding and removing without touching the api', async () => {
        const mounted = mountMembers({ reportId: undefined, memberIds: ['u1'] })
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: true, status: 200, data: userList([amy, zoe]) })

        await openPopover(wrapper)
        await flushPromises()

        await wrapper.find('.mp-add[data-id="u2"]').trigger('click')
        await nextTick()
        expect(wrapper.emitted('update:memberIds')?.at(-1)).toEqual([['u1', 'u2']])
        expect(mounted.api.report.addMembers).not.toHaveBeenCalled()

        await wrapper.setProps({ memberIds: ['u1', 'u2'] })
        await nextTick()
        await wrapper.find('.mp-remove[data-id="u2"]').trigger('click')
        await nextTick()
        expect(wrapper.emitted('update:memberIds')?.at(-1)).toEqual([['u1']])
        expect(mounted.api.report.removeMembers).not.toHaveBeenCalled()
    })

    it('keeps self available when the candidate query is unauthorized', async () => {
        const mounted = mountMembers({ reportId: undefined })
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: false, status: 403, data: null })

        await openPopover(wrapper)
        await flushPromises()

        expect(wrapper.find('.mp-add[data-id="me"]').text()).toContain('Me Myself')
        expect(wrapper.findComponent({ name: 'MembersPicker' }).props('loading')).toBe(false)
    })

    it('defaults to a bottom-end popover at extra-small size', () => {
        wrapper = mountMembers().wrapper

        expect(wrapper.findComponent({ name: 'UPopover' }).props('content')).toEqual({ side: 'bottom', align: 'end' })
        expect(wrapper.findComponent({ name: 'UButton' }).props('size')).toBe('xs')
    })

    it('plumbs a custom placement and size through', () => {
        wrapper = mountMembers({ placement: 'top-start', size: 'sm' }).wrapper

        expect(wrapper.findComponent({ name: 'UPopover' }).props('content')).toEqual({ side: 'top', align: 'start' })
        expect(wrapper.findComponent({ name: 'UButton' }).props('size')).toBe('sm')
    })
})

describe('MemberPopover popover', () => {
    it('opens read-only without remove or candidate controls', async () => {
        wrapper = mountMembers({ members: [amy], canEdit: false }).wrapper

        await openPopover(wrapper)

        expect(wrapper.findComponent({ name: 'MembersPicker' }).props('canEdit')).toBe(false)
        expect(wrapper.find('.mp-add').exists()).toBe(false)
        expect(wrapper.find('.mp-remove').exists()).toBe(false)
    })

    it('adds a candidate through the mutation', async () => {
        const mounted = mountMembers()
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: true, status: 200, data: userList([amy, zoe]) })
        mounted.api.report.addMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [zoe] } })

        await openPopover(wrapper)
        await flushPromises()

        await wrapper.find('.mp-add[data-id="u2"]').trigger('click')
        await flushPromises()

        expect(mounted.api.report.addMembers).toHaveBeenCalledWith('r1', ['u2'])
    })

    it('removes a member through the mutation', async () => {
        const mounted = mountMembers({ members: [amy] })
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: true, status: 200, data: userList([amy, zoe]) })
        mounted.api.report.removeMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [] } })

        await openPopover(wrapper)
        await flushPromises()

        await wrapper.find('.mp-remove[data-id="u1"]').trigger('click')
        await flushPromises()

        expect(mounted.api.report.removeMembers).toHaveBeenCalledWith('r1', ['u1'])
    })

    it('degrades the candidates to the current user when GET /user returns 403', async () => {
        const mounted = mountMembers()
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: false, status: 403, data: null })

        await openPopover(wrapper)
        await flushPromises()

        expect(wrapper.findComponent({ name: 'MembersPicker' }).props('candidates')).toEqual([
            { id: 'me', name: 'Me Myself', initials: 'MM' },
        ])
        expect(wrapper.find('.mp-add[data-id="me"]').text()).toContain('Me Myself')
    })

    it('toasts the server message when adding fails with 422', async () => {
        const mounted = mountMembers()
        wrapper = mounted.wrapper
        mounted.api.user.index.mockResolvedValue({ ok: true, status: 200, data: userList([amy, zoe]) })
        mounted.api.report.addMembers.mockResolvedValue({
            ok: false,
            status: 422,
            data: { message: 'One or more user ids are unknown.' },
        })

        await openPopover(wrapper)
        await flushPromises()

        await wrapper.find('.mp-add[data-id="u2"]').trigger('click')
        await flushPromises()

        expect(toastAdd).toHaveBeenCalledWith({ title: 'One or more user ids are unknown.', color: 'error' })
    })
})
