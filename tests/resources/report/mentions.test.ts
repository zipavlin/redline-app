import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Member } from '@/resources/report/model'

interface StoreUser {
    id: string
    role: string
}

interface StoreReport {
    id: string
    members?: Member[]
    author?: { id: string }
    [key: string]: unknown
}

const { mockStore, setStore, toastAdd } = vi.hoisted(() => {
    const store = {
        auth: { user: null as { id: string; role: string } | null, callback: null, authView: 'login' },
        activateSession: () => {},
        report: { active: null as Record<string, unknown> | null, list: [] as Record<string, unknown>[] },
    }
    return {
        mockStore: store,
        toastAdd: vi.fn(),
        setStore: (input: { user: StoreUser | null; active?: StoreReport | null; list?: StoreReport[] }) => {
            store.auth.user = input.user
            store.report.active = input.active ?? null
            store.report.list = input.list ?? []
        },
    }
})

vi.mock('@/composables/useStore', () => ({ useStore: () => mockStore }))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))

import { useMentionMemberSync } from '@/resources/report/mentions'

const amy: Member = { id: 'u1', name: 'Amy Alpha', initials: 'AA' }
const zoe: Member = { id: 'u2', name: 'Zoe Dev', initials: 'ZD' }

const mention = (id: string) => `<span data-type="mention" data-id="${id}">@${id}</span>`
const bodyWith = (...ids: string[]) => `<p>Hello ${ids.map(mention).join(' ')}</p>`

function mountRunner() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = { report: { addMembers: vi.fn() } }
    let sync!: (input: { reportId: string; html: string }) => Promise<void>
    const wrapper = mount(
        defineComponent({
            setup() {
                ({ sync } = useMentionMemberSync())
                return {}
            },
            template: '<div />',
        }),
        {
            global: {
                plugins: [[VueQueryPlugin, { queryClient }]],
                provide: { redline: { api, config: {} }, store: mockStore },
            },
        },
    )
    return { wrapper, api, sync }
}

beforeEach(() => {
    setStore({ user: null })
    toastAdd.mockClear()
})

describe('useMentionMemberSync', () => {
    it('adds only the mentioned users that are not already members', async () => {
        setStore({
            user: { id: 'u1', role: 'reporter' },
            active: { id: 'r1', author: { id: 'u1' }, members: [amy] },
        })
        const { api, sync } = mountRunner()
        api.report.addMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [amy, zoe] } })

        await sync({ reportId: 'r1', html: bodyWith('u1', 'u2', 'u2') })
        await flushPromises()

        expect(api.report.addMembers).toHaveBeenCalledTimes(1)
        expect(api.report.addMembers).toHaveBeenCalledWith('r1', ['u2'])
        expect(mockStore.report.active?.members).toEqual([amy, zoe])
        expect(toastAdd).not.toHaveBeenCalled()
    })

    it('lets a developer add members to a report they do not author', async () => {
        setStore({
            user: { id: 'u9', role: 'developer' },
            active: { id: 'r1', author: { id: 'u1' }, members: [] },
        })
        const { api, sync } = mountRunner()
        api.report.addMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [zoe] } })

        await sync({ reportId: 'r1', html: bodyWith('u2') })
        await flushPromises()

        expect(api.report.addMembers).toHaveBeenCalledWith('r1', ['u2'])
    })

    it('is a silent no-op for a reporter who is not the author', async () => {
        setStore({
            user: { id: 'u9', role: 'reporter' },
            active: { id: 'r1', author: { id: 'u1' }, members: [] },
        })
        const { api, sync } = mountRunner()

        await sync({ reportId: 'r1', html: bodyWith('u2') })
        await flushPromises()

        expect(api.report.addMembers).not.toHaveBeenCalled()
        expect(toastAdd).not.toHaveBeenCalled()
    })

    it('is a no-op when every mentioned user is already a member', async () => {
        setStore({
            user: { id: 'u1', role: 'reporter' },
            active: { id: 'r1', author: { id: 'u1' }, members: [amy, zoe] },
        })
        const { api, sync } = mountRunner()

        await sync({ reportId: 'r1', html: bodyWith('u1', 'u2') })
        await flushPromises()

        expect(api.report.addMembers).not.toHaveBeenCalled()
        expect(toastAdd).not.toHaveBeenCalled()
    })

    it('is a no-op when the report is not in the store', async () => {
        setStore({ user: { id: 'u1', role: 'reporter' } })
        const { api, sync } = mountRunner()

        await sync({ reportId: 'missing', html: bodyWith('u2') })
        await flushPromises()

        expect(api.report.addMembers).not.toHaveBeenCalled()
    })

    it('is a no-op when the body has no mentions', async () => {
        setStore({
            user: { id: 'u1', role: 'reporter' },
            active: { id: 'r1', author: { id: 'u1' }, members: [] },
        })
        const { api, sync } = mountRunner()

        await sync({ reportId: 'r1', html: '<p>just text</p>' })
        await flushPromises()

        expect(api.report.addMembers).not.toHaveBeenCalled()
    })

    it('finds the report in the list when it is not the active one', async () => {
        setStore({
            user: { id: 'u1', role: 'reporter' },
            active: { id: 'other', author: { id: 'u1' }, members: [] },
            list: [{ id: 'r1', author: { id: 'u1' }, members: [] }],
        })
        const { api, sync } = mountRunner()
        api.report.addMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [zoe] } })

        await sync({ reportId: 'r1', html: bodyWith('u2') })
        await flushPromises()

        expect(api.report.addMembers).toHaveBeenCalledWith('r1', ['u2'])
        expect(mockStore.report.list[0].members).toEqual([zoe])
    })

    it('toasts the server message when adding members fails', async () => {
        setStore({
            user: { id: 'u1', role: 'reporter' },
            active: { id: 'r1', author: { id: 'u1' }, members: [] },
        })
        const { api, sync } = mountRunner()
        api.report.addMembers.mockResolvedValue({
            ok: false,
            status: 422,
            data: { message: 'One or more user ids are unknown.' },
        })

        await expect(sync({ reportId: 'r1', html: bodyWith('ghost') })).resolves.toBeUndefined()
        await flushPromises()

        expect(toastAdd).toHaveBeenCalledWith({
            title: 'One or more user ids are unknown.',
            color: 'error',
        })
    })
})
