import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { userKeys } from '@/resources/user/keys'
import { useUserList, useUserTabCounts, useMemberCandidates, useUserMentionSearch } from '@/resources/user/queries'
import type { ApiResult } from '@/core/api/types'
import type { ListParams } from '@/core/api/params'
import type { UserListResponse } from '@/resources/user/model'
import { deferred, mountResource, unmountResources } from '../support/harness'

function makeApi() {
    return { user: { index: vi.fn(), aggregate: vi.fn() } }
}

function userListFixture(): UserListResponse {
    return {
        data: [{ id: 'u1', status: 'approved', created_at: '2026-01-01T00:00:00Z', name: 'Ada' }],
        meta: { total: 1, per_page: 16, current_page: 1, last_page: 1 },
        counts: { all: 1, active: 1, pending: 0 },
    }
}

afterEach(() => {
    unmountResources()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('useUserList', () => {
    it('fetches users and caches them under the params-scoped key', async () => {
        const params: ListParams = { 'filter[role]': 'reporter' }
        const fixture = userListFixture()
        const { api, queryClient, result } = mountResource(
            (api) => useUserList(params),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: true, status: 200, data: fixture }),
        )
        await flushPromises()

        expect(api.user.index).toHaveBeenCalledWith(params)
        expect(result.data.value).toEqual(fixture)
        expect(queryClient.getQueryData(userKeys.list(params))).toEqual(fixture)
    })

    it('throws "Failed to load users" when the response is not ok', async () => {
        const { api, result } = mountResource(
            (api) => useUserList({}),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: false, status: 500, data: null }),
        )
        await flushPromises()

        expect(result.isError.value).toBe(true)
        expect(result.error.value?.message).toBe('Failed to load users')
        expect((result.error.value as unknown as { status?: number })?.status).toBe(500)
    })

    it('stays disabled until the enabled flag turns on', async () => {
        const enabled = ref(false)
        const { api, result } = mountResource(
            (api) => useUserList({}, { enabled }),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: true, status: 200, data: userListFixture() }),
        )
        await flushPromises()
        expect(api.user.index).not.toHaveBeenCalled()

        enabled.value = true
        await flushPromises()
        expect(api.user.index).toHaveBeenCalledTimes(1)
        expect(result.data.value).toEqual(userListFixture())
    })

    it('refetches on the configured refetchInterval', async () => {
        vi.useFakeTimers()
        const { api, result } = mountResource(
            (api) => useUserList({}, { refetchInterval: 50 }),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: true, status: 200, data: userListFixture() }),
        )

        await vi.advanceTimersByTimeAsync(0)
        expect(api.user.index).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(50)
        expect(api.user.index).toHaveBeenCalledTimes(2)
        expect(result.data.value).toEqual(userListFixture())
    })
})

describe('useMemberCandidates', () => {
    it('requests approved non-guest candidates with name/initials and a name sort', async () => {
        const fixture = userListFixture()
        const { api, queryClient, result } = mountResource(
            () => useMemberCandidates({}),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: true, status: 200, data: fixture }),
        )
        await flushPromises()

        expect(api.user.index).toHaveBeenCalledWith({
            'filter[status]': 'approved',
            'filter[role:in]': 'reporter,developer,admin',
            'include[]': ['name', 'initials'],
            'sort[name]': 'asc',
        })
        expect(result.data.value).toEqual(fixture)
        expect(queryClient.getQueryData(userKeys.list({
            'filter[status]': 'approved',
            'filter[role:in]': 'reporter,developer,admin',
            'include[]': ['name', 'initials'],
            'sort[name]': 'asc',
        }))).toEqual(fixture)
    })

    it('stays disabled until the enabled flag turns on', async () => {
        const enabled = ref(false)
        const { api } = mountResource(
            () => useMemberCandidates({ enabled }),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: true, status: 200, data: userListFixture() }),
        )
        await flushPromises()
        expect(api.user.index).not.toHaveBeenCalled()

        enabled.value = true
        await flushPromises()
        expect(api.user.index).toHaveBeenCalledTimes(1)
    })

    it('surfaces a 403 via error.status so callers can degrade to self', async () => {
        const { result } = mountResource(
            () => useMemberCandidates({}),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: false, status: 403, data: null }),
        )
        await flushPromises()

        expect(result.isError.value).toBe(true)
        expect((result.error.value as unknown as { status?: number })?.status).toBe(403)
    })
})

describe('useUserTabCounts', () => {
    it('requests the explicit status:count aggregate and derives {all, active, pending}', async () => {
        const { api, queryClient, result } = mountResource(
            (api) => useUserTabCounts({}),
            makeApi,
            (api) =>
                api.user.aggregate.mockResolvedValue({
                    ok: true,
                    status: 200,
                    data: { status: { count: { approved: 5, pending: 2, new: 9 } } },
                }),
        )
        await flushPromises()

        expect(api.user.aggregate).toHaveBeenCalledWith({ 'aggregate[status:count]': 'approved,pending' })
        expect(result.data.value).toEqual({ all: 7, active: 5, pending: 2 })
        expect(queryClient.getQueryData([...userKeys.all, 'tabs', {}])).toEqual({ all: 7, active: 5, pending: 2 })
    })

    it('forwards search/role filters alongside the status aggregate', async () => {
        const params: ListParams = { 'filter[search]': 'ada', 'filter[role]': 'reporter' }
        const { api } = mountResource(
            (api) => useUserTabCounts(params),
            makeApi,
            (api) => api.user.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: { count: {} } } }),
        )
        await flushPromises()

        expect(api.user.aggregate).toHaveBeenCalledWith({
            'aggregate[status:count]': 'approved,pending',
            'filter[search]': 'ada',
            'filter[role]': 'reporter',
        })
    })

    it('shows zeroed placeholder counts while the aggregate is loading', async () => {
        const pending = deferred<ApiResult<{ status: { count: Record<string, number> } }>>()
        const { api, result } = mountResource(
            (api) => useUserTabCounts({}),
            makeApi,
            (api) => api.user.aggregate.mockReturnValue(pending.promise),
        )
        await flushPromises()
        expect(result.data.value).toEqual({ all: 0, active: 0, pending: 0 })

        pending.resolve({ ok: true, status: 200, data: { status: { count: { approved: 5, pending: 2 } } } })
        await flushPromises()
        expect(result.data.value).toEqual({ all: 7, active: 5, pending: 2 })
    })

    it('defaults missing or empty status counts to zero', async () => {
        const { api, result } = mountResource(
            (api) => useUserTabCounts({}),
            makeApi,
            (api) => api.user.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: {} } }),
        )
        await flushPromises()
        expect(result.data.value).toEqual({ all: 0, active: 0, pending: 0 })

        api.user.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: { count: {} } } })
        await result.refetch()
        await flushPromises()
        expect(result.data.value).toEqual({ all: 0, active: 0, pending: 0 })
    })

    it('throws "Failed to load user tab counts" when the response is not ok', async () => {
        const { api, result } = mountResource(
            (api) => useUserTabCounts({}),
            makeApi,
            (api) => api.user.aggregate.mockResolvedValue({ ok: false, status: 500, data: null }),
        )
        await flushPromises()

        expect(result.isError.value).toBe(true)
        expect(result.error.value?.message).toBe('Failed to load user tab counts')
    })

    it('does not refetch on remount while the 30s staleTime window is open', async () => {
        const first = mountResource(
            (api) => useUserTabCounts({}),
            makeApi,
            (api) => api.user.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: { count: { approved: 1 } } } }),
        )
        await flushPromises()
        expect(first.api.user.aggregate).toHaveBeenCalledTimes(1)
        first.wrapper.unmount()

        const second = mount(
            defineComponent({
                setup() {
                    useUserTabCounts({})
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
        expect(first.api.user.aggregate).toHaveBeenCalledTimes(1)
        second.unmount()
    })

    it('stays disabled until the enabled flag turns on', async () => {
        const enabled = ref(false)
        const { api, result } = mountResource(
            (api) => useUserTabCounts({}, { enabled }),
            makeApi,
            (api) => api.user.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: { count: { approved: 1 } } } }),
        )
        await flushPromises()
        expect(api.user.aggregate).not.toHaveBeenCalled()

        enabled.value = true
        await flushPromises()
        expect(api.user.aggregate).toHaveBeenCalledTimes(1)
        expect(result.data.value).toEqual({ all: 1, active: 1, pending: 0 })
    })

    it('refetches on the configured refetchInterval', async () => {
        vi.useFakeTimers()
        const { api, result } = mountResource(
            (api) => useUserTabCounts({}, { refetchInterval: 50 }),
            makeApi,
            (api) => api.user.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: { count: { approved: 1 } } } }),
        )

        await vi.advanceTimersByTimeAsync(0)
        expect(api.user.aggregate).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(50)
        expect(api.user.aggregate).toHaveBeenCalledTimes(2)
        expect(result.data.value).toEqual({ all: 1, active: 1, pending: 0 })
    })
})

describe('useUserMentionSearch', () => {
    it('debounces rapid calls into one candidate-search request', async () => {
        vi.useFakeTimers()
        const fixture = userListFixture()
        const { api, result } = mountResource(
            () => useUserMentionSearch(),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: true, status: 200, data: fixture }),
        )

        const superseded = result('a')
        const latest = result('ab')
        await vi.advanceTimersByTimeAsync(100)
        expect(api.user.index).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(150)
        expect(api.user.index).toHaveBeenCalledTimes(1)
        expect(api.user.index).toHaveBeenCalledWith({
            'filter[status]': 'approved',
            'filter[role:in]': 'reporter,developer,admin',
            'include[]': ['name', 'initials'],
            'sort[name]': 'asc',
            'filter[search]': 'ab',
        })
        await expect(superseded).resolves.toEqual([])
        await expect(latest).resolves.toEqual(fixture.data)
    })

    it('drops a stale in-flight response when a newer search starts', async () => {
        vi.useFakeTimers()
        const slow = deferred<ApiResult<UserListResponse>>()
        const fast = deferred<ApiResult<UserListResponse>>()
        const { api, result } = mountResource(
            () => useUserMentionSearch(),
            makeApi,
            (api) => { api.user.index.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise) },
        )

        const stale = result('ada')
        await vi.advanceTimersByTimeAsync(250)
        expect(api.user.index).toHaveBeenCalledTimes(1)

        const current = result('bob')
        await vi.advanceTimersByTimeAsync(250)
        expect(api.user.index).toHaveBeenCalledTimes(2)

        slow.resolve({ ok: true, status: 200, data: userListFixture() })
        await flushPromises()
        await expect(stale).resolves.toEqual([])

        fast.resolve({ ok: true, status: 200, data: userListFixture() })
        await flushPromises()
        await expect(current).resolves.toEqual(userListFixture().data)
    })

    it('resolves [] when the response is not ok', async () => {
        vi.useFakeTimers()
        const { result } = mountResource(
            () => useUserMentionSearch(),
            makeApi,
            (api) => api.user.index.mockResolvedValue({ ok: false, status: 403, data: null }),
        )

        const promise = result('ada')
        await vi.advanceTimersByTimeAsync(250)
        await expect(promise).resolves.toEqual([])
    })

    it('resolves [] when the request throws', async () => {
        vi.useFakeTimers()
        const { result } = mountResource(
            () => useUserMentionSearch(),
            makeApi,
            (api) => api.user.index.mockRejectedValue(new Error('network down')),
        )

        const promise = result('ada')
        await vi.advanceTimersByTimeAsync(250)
        await expect(promise).resolves.toEqual([])
    })
})
