import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { reportKeys } from '@/resources/report/keys'
import { useReportAggregate, useReportList } from '@/resources/report/queries'
import type { ApiResult } from '@/core/api/types'
import type { ListParams } from '@/core/api/params'
import type { ReportListResponse } from '@/resources/report/model'
import { deferred, mountResource, unmountResources } from '../support/harness'

function makeApi() {
    return { report: { list: vi.fn(), aggregate: vi.fn() } }
}

function listFixture(id = 'r1'): ReportListResponse {
    return {
        data: [{ id, status: 'new', created_at: '2026-01-01T00:00:00Z' }],
        meta: { total: 1, per_page: 16, current_page: 1, last_page: 1 },
        counts: { all: 1, unresolved: 1, resolved: 0 },
    }
}

afterEach(() => {
    unmountResources()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('useReportList', () => {
    it('fetches the list and caches it under the params-scoped key', async () => {
        const params: ListParams = { 'filter[status]': 'new' }
        const fixture = listFixture()
        const { api, queryClient, result } = mountResource(
            (api) => useReportList(params),
            makeApi,
            (api) => api.report.list.mockResolvedValue({ ok: true, status: 200, data: fixture }),
        )
        await flushPromises()

        expect(api.report.list).toHaveBeenCalledWith(params)
        expect(result.data.value).toEqual(fixture)
        expect(queryClient.getQueryData(reportKeys.list(params))).toEqual(fixture)
    })

    it('throws "Failed to load reports" when the response is not ok', async () => {
        const { api, result } = mountResource(
            (api) => useReportList({}),
            makeApi,
            (api) => api.report.list.mockResolvedValue({ ok: false, status: 500, data: null }),
        )
        await flushPromises()

        expect(result.isError.value).toBe(true)
        expect(result.error.value?.message).toBe('Failed to load reports')
    })

    it('refetches with the new params and keeps previous data as placeholder while loading', async () => {
        const params = ref<ListParams>({ 'filter[status]': 'new' })
        const first = listFixture('r1')
        const { api, queryClient, result } = mountResource(
            (api) => useReportList(params),
            makeApi,
            (api) => api.report.list.mockResolvedValue({ ok: true, status: 200, data: first }),
        )
        await flushPromises()
        expect(result.data.value).toEqual(first)

        // Switch params; the new fetch stays pending so the placeholder is observable.
        const pending = deferred<ApiResult<ReportListResponse>>()
        api.report.list.mockReturnValue(pending.promise)
        params.value = { 'filter[status]': 'progress' }
        await flushPromises()

        expect(api.report.list).toHaveBeenCalledWith({ 'filter[status]': 'progress' })
        expect(result.data.value).toEqual(first) // PlaceholderData: (prev) => prev

        const second = listFixture('r2')
        pending.resolve({ ok: true, status: 200, data: second })
        await flushPromises()

        expect(result.data.value).toEqual(second)
        expect(queryClient.getQueryData(reportKeys.list({ 'filter[status]': 'progress' }))).toEqual(second)
        expect(queryClient.getQueryData(reportKeys.list({ 'filter[status]': 'new' }))).toEqual(first)
    })

    it('refetches on the configured refetchInterval', async () => {
        vi.useFakeTimers()
        const { api, result } = mountResource(
            (api) => useReportList({}, { refetchInterval: 50 }),
            makeApi,
            (api) => api.report.list.mockResolvedValue({ ok: true, status: 200, data: listFixture() }),
        )

        await vi.advanceTimersByTimeAsync(0) // Settle the initial fetch
        expect(api.report.list).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(50)
        expect(api.report.list).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(50)
        expect(api.report.list).toHaveBeenCalledTimes(3)
        expect(result.data.value).toEqual(listFixture())
    })
})

describe('useReportAggregate', () => {
    it('fetches the aggregate and caches it under the params-scoped key', async () => {
        const params: ListParams = { 'aggregate[status:count]': 'new,resolved' }
        const data = { 'status:count': { new: 3, resolved: 1 } }
        const { api, queryClient, result } = mountResource(
            (api) => useReportAggregate(params),
            makeApi,
            (api) => api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data }),
        )
        await flushPromises()

        expect(api.report.aggregate).toHaveBeenCalledWith(params)
        expect(result.data.value).toEqual(data)
        expect(queryClient.getQueryData(reportKeys.aggregate(params))).toEqual(data)
    })

    it('throws "Failed to load aggregates" when the response is not ok', async () => {
        const { api, result } = mountResource(
            (api) => useReportAggregate({}),
            makeApi,
            (api) => api.report.aggregate.mockResolvedValue({ ok: false, status: 500, data: null }),
        )
        await flushPromises()

        expect(result.isError.value).toBe(true)
        expect(result.error.value?.message).toBe('Failed to load aggregates')
    })

    it('applies the select option to the observed data while the cache keeps the raw payload', async () => {
        const raw = { 'status:count': { new: 3, resolved: 1 } }
        const { api, queryClient, result } = mountResource(
            (api) => useReportAggregate({}, { select: (d) => d['status:count'] }),
            makeApi,
            (api) => api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data: raw }),
        )
        await flushPromises()

        expect(result.data.value).toEqual({ new: 3, resolved: 1 })
        expect(queryClient.getQueryData(reportKeys.aggregate({}))).toEqual(raw)
    })

    it('appends the key option to the aggregate query key', async () => {
        const params: ListParams = { 'filter[status]': 'new' }
        const data = { 'status:count': { new: 1 } }
        const { api, queryClient } = mountResource(
            (api) => useReportAggregate(params, { key: ['tab', 'all'] }),
            makeApi,
            (api) => api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data }),
        )
        await flushPromises()

        const keyed = [...reportKeys.aggregate(params), 'tab', 'all']
        expect(queryClient.getQueryData(keyed)).toEqual(data)
        // Without the key suffix the aggregate stays uncached - the key option is what isolates it.
        expect(queryClient.getQueryData(reportKeys.aggregate(params))).toBeUndefined()
    })

    it('does not refetch on remount while the staleTime window is open', async () => {
        const makeApiStale = () => ({ report: { list: vi.fn(), aggregate: vi.fn() } })
        const first = mountResource(
            (api) => useReportAggregate({}, { staleTime: 60_000 }),
            makeApiStale,
            (api) => api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data: { 'status:count': { new: 1 } } }),
        )
        await flushPromises()
        expect(first.api.report.aggregate).toHaveBeenCalledTimes(1)
        first.wrapper.unmount()

        // Same QueryClient, fresh observer: data is still fresh, so no refetch.
        const second = mount(
            defineComponent({
                setup() {
                    useReportAggregate({}, { staleTime: 60_000 })
                    return {}
                },
                template: '<div />',
            }),
            {
                global: {
                    plugins: [[VueQueryPlugin, { queryClient: first.queryClient }]],
                    provide: { redline: { api: first.api, config: {} } },
                },
            },
        )
        await flushPromises()
        expect(first.api.report.aggregate).toHaveBeenCalledTimes(1)
        second.unmount()
    })

    it('refetches on the configured refetchInterval', async () => {
        vi.useFakeTimers()
        const { api, result } = mountResource(
            (api) => useReportAggregate({}, { refetchInterval: 50 }),
            makeApi,
            (api) => api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data: { 'status:count': { new: 1 } } }),
        )

        await vi.advanceTimersByTimeAsync(0)
        expect(api.report.aggregate).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(50)
        expect(api.report.aggregate).toHaveBeenCalledTimes(2)
        expect(result.data.value).toEqual({ 'status:count': { new: 1 } })
    })
})
