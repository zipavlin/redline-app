import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { reportKeys } from '@/resources/report/keys'

/**
 * Mock the Pinia store accessor so the body-update mutation's store merge can be
 * asserted against a controllable fake (same inject pattern the stores provide).
 */
interface MockReportEntry {
    id?: string
    author?: unknown
    [key: string]: unknown
}

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

vi.mock('@/composables/useStore', () => ({
    useStore: () => mockStore,
}))

import { useUpdateReportBodyMutation, useDeleteReportMutation, useReportPriorityMutation, useReportDueMutation, dueMutationError } from '@/resources/report/mutations'

interface Mutations {
    updateBody: ReturnType<typeof useUpdateReportBodyMutation>
    deleteReport: ReturnType<typeof useDeleteReportMutation>
    priority: ReturnType<typeof useReportPriorityMutation>
    due: ReturnType<typeof useReportDueMutation>
}

function mountRunner() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = {
        report: { update: vi.fn(), destroy: vi.fn(), priority: vi.fn(), due: vi.fn() },
    }
    // Populated synchronously by setup() during mount(), before mountRunner returns.
    let mutations!: Mutations
    const wrapper = mount(
        defineComponent({
            setup() {
                mutations = {
                    updateBody: useUpdateReportBodyMutation(),
                    deleteReport: useDeleteReportMutation(),
                    priority: useReportPriorityMutation(),
                    due: useReportDueMutation(),
                }
                return {}
            },
            template: '<div />',
        }),
        {
            global: {
                plugins: [[VueQueryPlugin, { queryClient }]],
                provide: {
                    redline: { api, config: {} },
                    store: mockStore,
                },
            },
        },
    )
    return { wrapper, api, queryClient, mutations }
}

describe('useUpdateReportBodyMutation', () => {
    beforeEach(() => setMockStore(null, []))

    it('PATCHes report/{id} with the body', async () => {
        const { api, mutations } = mountRunner()
        api.report.update.mockResolvedValue({ ok: true, data: { id: 'r1', body: '<p>new</p>' } })
        await mutations.updateBody.mutateAsync({ id: 'r1', body: '<p>new</p>' })
        await flushPromises()
        expect(api.report.update).toHaveBeenCalledWith('r1', '<p>new</p>')
    })

    it('merges the response into the active Pinia report and its list entry, preserving transients', async () => {
        const { api, mutations } = mountRunner()
        setMockStore(
            {
                id: 'r1',
                body: '<p>old</p>',
                author: { id: 'u1', name: 'Ada' },
                _pageX: 12,
                _pageY: 34,
                element: { tagName: 'DIV' },
            },
            [{ id: 'r1', body: '<p>old</p>', _pageY: 34 }],
        )
        /**
         * A fresh()->toArray() PATCH response: no author, string/null element,
         * no transient page-pixel keys.
         */
        api.report.update.mockResolvedValue({
            ok: true,
            data: { id: 'r1', body: '<p>new</p>', status: 'new', element: null },
        })
        await mutations.updateBody.mutateAsync({ id: 'r1', body: '<p>new</p>' })
        await flushPromises()

        expect(mockStore.report.active).toMatchObject({
            id: 'r1',
            body: '<p>new</p>',
            author: { id: 'u1', name: 'Ada' },
            _pageX: 12,
            _pageY: 34,
            element: { tagName: 'DIV' },
        })
        expect(mockStore.report.list[0]).toMatchObject({ id: 'r1', body: '<p>new</p>', _pageY: 34 })
    })

    it('prefers the response author when the backend includes it', async () => {
        const { api, mutations } = mountRunner()
        setMockStore({ id: 'r1', author: { id: 'u1', name: 'Ada' } }, [])
        api.report.update.mockResolvedValue({
            ok: true,
            data: { id: 'r1', body: '<p>new</p>', author: { id: 'u2', name: 'Grace' } },
        })
        await mutations.updateBody.mutateAsync({ id: 'r1', body: '<p>new</p>' })
        await flushPromises()
        expect(mockStore.report.active?.author).toEqual({ id: 'u2', name: 'Grace' })
    })

    it('does not touch the active report when it is a different id', async () => {
        const { api, mutations } = mountRunner()
        setMockStore({ id: 'other', body: '<p>untouched</p>' }, [])
        api.report.update.mockResolvedValue({ ok: true, data: { id: 'r1', body: '<p>new</p>' } })
        await mutations.updateBody.mutateAsync({ id: 'r1', body: '<p>new</p>' })
        await flushPromises()
        expect(mockStore.report.active).toMatchObject({ id: 'other', body: '<p>untouched</p>' })
    })

    it('invalidates report lists, detail and aggregates', async () => {
        const { api, mutations, queryClient } = mountRunner()
        api.report.update.mockResolvedValue({ ok: true, data: { id: 'r1', body: 'x' } })
        queryClient.setQueryData(reportKeys.lists(), { data: [] })
        queryClient.setQueryData(reportKeys.detail('r1'), { id: 'r1' })
        queryClient.setQueryData(reportKeys.aggregates(), {})
        await mutations.updateBody.mutateAsync({ id: 'r1', body: 'x' })
        await flushPromises()
        expect(queryClient.getQueryState(reportKeys.lists())?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.detail('r1'))?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.aggregates())?.isInvalidated).toBe(true)
    })
})

describe('useDeleteReportMutation', () => {
    it('DELETEs report/{id} and invalidates lists + aggregates', async () => {
        const { api, mutations, queryClient } = mountRunner()
        api.report.destroy.mockResolvedValue({ ok: true, data: null })
        queryClient.setQueryData(reportKeys.lists(), { data: [] })
        queryClient.setQueryData(reportKeys.aggregates(), {})
        await mutations.deleteReport.mutateAsync('r1')
        await flushPromises()
        expect(api.report.destroy).toHaveBeenCalledWith('r1')
        expect(queryClient.getQueryState(reportKeys.lists())?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.aggregates())?.isInvalidated).toBe(true)
    })
})

describe('useReportPriorityMutation', () => {
    beforeEach(() => setMockStore(null, []))

    it('PATCHes report/{id}/priority and merges the fresh row into the active report and its list entry', async () => {
        const { api, mutations } = mountRunner()
        setMockStore({ id: 'r1', priority: 'normal' }, [{ id: 'r1', priority: 'normal' }])
        api.report.priority.mockResolvedValue({ ok: true, data: { id: 'r1', priority: 'critical', status: 'new' } })
        await mutations.priority.mutateAsync({ id: 'r1', priority: 'critical' })
        await flushPromises()

        expect(api.report.priority).toHaveBeenCalledWith('r1', 'critical')
        expect(mockStore.report.active).toMatchObject({ id: 'r1', priority: 'critical' })
        expect(mockStore.report.list[0]).toMatchObject({ id: 'r1', priority: 'critical' })
    })

    it('invalidates report lists, detail and aggregates', async () => {
        const { api, mutations, queryClient } = mountRunner()
        api.report.priority.mockResolvedValue({ ok: true, data: { id: 'r1', priority: 'high' } })
        queryClient.setQueryData(reportKeys.lists(), { data: [] })
        queryClient.setQueryData(reportKeys.detail('r1'), { id: 'r1' })
        queryClient.setQueryData(reportKeys.aggregates(), {})
        await mutations.priority.mutateAsync({ id: 'r1', priority: 'high' })
        await flushPromises()
        expect(queryClient.getQueryState(reportKeys.lists())?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.detail('r1'))?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.aggregates())?.isInvalidated).toBe(true)
    })
})

describe('useReportDueMutation', () => {
    beforeEach(() => setMockStore(null, []))

    it('PATCHes report/{id}/due_at and merges the fresh row into the active report and its list entry', async () => {
        const { api, mutations } = mountRunner()
        setMockStore({ id: 'r1', due_at: null }, [{ id: 'r1', due_at: null }])
        api.report.due.mockResolvedValue({ ok: true, data: { id: 'r1', due_at: '2026-07-03T17:00:00Z', status: 'new' } })
        await mutations.due.mutateAsync({ id: 'r1', due_at: '2026-07-03T17:00:00Z' })
        await flushPromises()

        expect(api.report.due).toHaveBeenCalledWith('r1', '2026-07-03T17:00:00Z')
        expect(mockStore.report.active).toMatchObject({ id: 'r1', due_at: '2026-07-03T17:00:00Z' })
        expect(mockStore.report.list[0]).toMatchObject({ id: 'r1', due_at: '2026-07-03T17:00:00Z' })
    })

    it('clears the deadline by PATCHing null', async () => {
        const { api, mutations } = mountRunner()
        setMockStore({ id: 'r1', due_at: '2026-07-03T17:00:00Z' }, [])
        api.report.due.mockResolvedValue({ ok: true, data: { id: 'r1', due_at: null } })
        await mutations.due.mutateAsync({ id: 'r1', due_at: null })
        await flushPromises()

        expect(api.report.due).toHaveBeenCalledWith('r1', null)
        expect(mockStore.report.active).toMatchObject({ id: 'r1', due_at: null })
    })

    it('invalidates report lists, detail and aggregates', async () => {
        const { api, mutations, queryClient } = mountRunner()
        api.report.due.mockResolvedValue({ ok: true, data: { id: 'r1', due_at: '2026-07-03T17:00:00Z' } })
        queryClient.setQueryData(reportKeys.lists(), { data: [] })
        queryClient.setQueryData(reportKeys.detail('r1'), { id: 'r1' })
        queryClient.setQueryData(reportKeys.aggregates(), {})
        await mutations.due.mutateAsync({ id: 'r1', due_at: '2026-07-03T17:00:00Z' })
        await flushPromises()
        expect(queryClient.getQueryState(reportKeys.lists())?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.detail('r1'))?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.aggregates())?.isInvalidated).toBe(true)
    })

    it('throws with the failed response attached when the response is not ok', async () => {
        const { api, mutations } = mountRunner()
        const bad = { ok: false, status: 422, data: null }
        api.report.due.mockResolvedValue(bad)
        await expect(mutations.due.mutateAsync({ id: 'r1', due_at: 'nope' })).rejects.toMatchObject({
            message: 'Failed to update due date',
            response: bad,
        })
    })
})

describe('dueMutationError', () => {
    it('uses the server message for a 422', () => {
        expect(dueMutationError({ response: { status: 422, data: { message: 'The due at must be a valid date.' } } }))
            .toBe('The due at must be a valid date.')
    })

    it('maps a 403 to a permission message', () => {
        expect(dueMutationError({ response: { status: 403 } })).toBe('You do not have permission to change the due date')
    })

    it('falls back for an unmapped error, honouring a custom fallback', () => {
        expect(dueMutationError(new Error('x'))).toBe('Could not update due date')
        expect(dueMutationError(new Error('x'), 'Custom')).toBe('Custom')
    })
})
