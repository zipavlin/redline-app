import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { reportKeys } from '@/resources/report/keys'
import type { Member } from '@/resources/report/model'

interface MockReportEntry {
    id?: string
    members?: Member[]
    members_count?: number
    members_exists?: boolean
    [key: string]: unknown
}

/**
 * Mock the Pinia store accessor so the member mutations can merge into a
 * controllable fake report (active + list), same inject pattern the stores use.
 */
const { mockStore, setMockStore } = vi.hoisted(() => {
    const store: {
        auth: { user: null; callback: null; authView: string }
        activateSession: () => void
        report: { active: MockReportEntry | null; list: MockReportEntry[] }
    } = {
        auth: { user: null, callback: null, authView: 'login' },
        activateSession: () => {},
        report: { active: null, list: [] },
    }
    return {
        mockStore: store,
        setMockStore: (active: MockReportEntry | null, list: MockReportEntry[]) => {
            store.report.active = active
            store.report.list = list
        },
    }
})

vi.mock('@/composables/useStore', () => ({ useStore: () => mockStore }))

import { useAddMembersMutation, useRemoveMembersMutation } from '@/resources/report/mutations'

const amy: Member = { id: 'u1', name: 'Amy Alpha', initials: 'AA' }
const zoe: Member = { id: 'u2', name: 'Zoe Dev', initials: 'ZD' }

interface Mutations {
    add: ReturnType<typeof useAddMembersMutation>
    remove: ReturnType<typeof useRemoveMembersMutation>
}

function mountRunner() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = { report: { addMembers: vi.fn(), removeMembers: vi.fn() } }
    let mutations!: Mutations
    const wrapper = mount(
        defineComponent({
            setup() {
                mutations = {
                    add: useAddMembersMutation(),
                    remove: useRemoveMembersMutation(),
                }
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
    return { wrapper, api, queryClient, mutations }
}

describe('useAddMembersMutation / useRemoveMembersMutation', () => {
    beforeEach(() => setMockStore(null, []))

    it('adds members and applies the server list to the active report and list row', async () => {
        setMockStore(
            { id: 'r1', members: [amy], members_count: 1, members_exists: true },
            [{ id: 'r1', members: [amy], members_count: 1, members_exists: true }],
        )
        const { api, mutations } = mountRunner()
        api.report.addMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [amy, zoe] } })

        await mutations.add.mutateAsync({ id: 'r1', userIds: ['u2'], optimistic: [zoe] })
        await flushPromises()

        expect(api.report.addMembers).toHaveBeenCalledWith('r1', ['u2'])
        expect(mockStore.report.active).toMatchObject({
            members: [amy, zoe],
            members_count: 2,
            members_exists: true,
        })
        expect(mockStore.report.list[0]).toMatchObject({
            members: [amy, zoe],
            members_count: 2,
            members_exists: true,
        })
    })

    it('removes members and applies the server list', async () => {
        setMockStore(
            { id: 'r1', members: [amy, zoe], members_count: 2, members_exists: true },
            [],
        )
        const { api, mutations } = mountRunner()
        api.report.removeMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [amy] } })

        await mutations.remove.mutateAsync({ id: 'r1', userIds: ['u2'] })
        await flushPromises()

        expect(api.report.removeMembers).toHaveBeenCalledWith('r1', ['u2'])
        expect(mockStore.report.active).toMatchObject({ members: [amy], members_count: 1, members_exists: true })
    })

    it('leaves other reports untouched', async () => {
        setMockStore({ id: 'other', members: [amy] }, [])
        const { api, mutations } = mountRunner()
        api.report.addMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [amy, zoe] } })

        await mutations.add.mutateAsync({ id: 'r1', userIds: ['u2'] })
        await flushPromises()

        expect(mockStore.report.active).toMatchObject({ id: 'other', members: [amy] })
    })

    it('merges the optimistic member immediately, then rolls back on error', async () => {
        setMockStore(
            { id: 'r1', members: [amy], members_count: 1, members_exists: true },
            [{ id: 'r1', members: [amy], members_count: 1, members_exists: true }],
        )
        const { api, mutations } = mountRunner()
        let reject!: (reason?: unknown) => void
        api.report.addMembers.mockReturnValue(new Promise((_resolve, rej) => { reject = rej }))

        const call = mutations.add.mutateAsync({ id: 'r1', userIds: ['u2'], optimistic: [zoe] })
        await flushPromises()

        expect(mockStore.report.active).toMatchObject({ members: [amy, zoe], members_count: 2 })
        expect(mockStore.report.list[0]).toMatchObject({ members: [amy, zoe], members_count: 2 })

        reject(Object.assign(new Error('nope'), { response: { status: 500 } }))
        await expect(call).rejects.toMatchObject({ response: { status: 500 } })
        await flushPromises()

        expect(mockStore.report.active).toMatchObject({ members: [amy], members_count: 1 })
        expect(mockStore.report.list[0]).toMatchObject({ members: [amy], members_count: 1 })
    })

    it('throws with the failed response attached so callers can read response.status', async () => {
        setMockStore({ id: 'r1', members: [amy] }, [])
        const { api, mutations } = mountRunner()
        const bad = { ok: false, status: 422, data: { message: 'One or more user ids are unknown.' } }
        api.report.addMembers.mockResolvedValue(bad)

        await expect(mutations.add.mutateAsync({ id: 'r1', userIds: ['ghost'] })).rejects.toMatchObject({
            message: 'Failed to update members',
            response: bad,
        })
    })

    it('invalidates report lists and the report detail', async () => {
        const { api, mutations, queryClient } = mountRunner()
        api.report.removeMembers.mockResolvedValue({ ok: true, status: 200, data: { members: [] } })
        queryClient.setQueryData(reportKeys.lists(), { data: [] })
        queryClient.setQueryData(reportKeys.detail('r1'), { id: 'r1' })

        await mutations.remove.mutateAsync({ id: 'r1', userIds: ['u2'] })
        await flushPromises()

        expect(queryClient.getQueryState(reportKeys.lists())?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.detail('r1'))?.isInvalidated).toBe(true)
    })
})
