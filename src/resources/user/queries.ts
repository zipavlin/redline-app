import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import { userKeys } from '@/resources/user/keys'
import type { ListParams } from '@/core/api/params'
import type { UserCounts, UserListResponse } from '@/resources/user/model'

export function useUserList(params: MaybeRefOrGetter<ListParams>, opts?: {
    refetchInterval?: number
    enabled?: MaybeRefOrGetter<boolean>
}) {
    const api = useApi()
    return useQuery({
        queryKey: computed(() => userKeys.list(toValue(params))),
        enabled: computed(() => toValue(opts?.enabled) ?? true),
        queryFn: async (): Promise<UserListResponse> => {
            const res = await api.user.index(toValue(params))
            if (!res.ok) throw Object.assign(new Error('Failed to load users'), { status: res.status })
            return res.data
        },
        placeholderData: (prev) => prev,
        ...(opts?.refetchInterval !== undefined && { refetchInterval: opts.refetchInterval }),
    })
}

/**
 * Candidate users eligible for report membership: approved and non-guest. The
 * backend 422s pending/guest ids, so they are never offered. `GET /user` is
 * admin-only in contract v1 - callers degrade on a 403 that surfaces via
 * `error.status`.
 */
export const MEMBER_CANDIDATE_PARAMS: ListParams = {
    'filter[status]': 'approved',
    'filter[role:in]': 'reporter,developer,admin',
    'include[]': ['name', 'initials'],
    'sort[name]': 'asc',
}

export function useMemberCandidates(opts?: { enabled?: MaybeRefOrGetter<boolean> }) {
    return useUserList(MEMBER_CANDIDATE_PARAMS, { enabled: opts?.enabled })
}

export function useUserTabCounts(params: MaybeRefOrGetter<ListParams>, opts?: {
    refetchInterval?: number
    enabled?: MaybeRefOrGetter<boolean>
}) {
    const api = useApi()
    return useQuery({
        queryKey: computed(() => [...userKeys.all, 'tabs', toValue(params)] as const),
        enabled: computed(() => toValue(opts?.enabled) ?? true),
        queryFn: async (): Promise<UserCounts> => {
            /**
             * Tab counts require the explicit aggregate[] param (else the backend
             * returns no counts). search + role are forwarded so tabs respect
             * those filters; status is intentionally excluded so the tabs
             * don't jump as you switch them.
             */
            const res = await api.user.aggregate({
                'aggregate[status:count]': 'approved,pending',
                ...toValue(params),
            })
            if (!res.ok) throw new Error('Failed to load user tab counts')
            const statusCounts = (res.data['status'] as Record<string, unknown>)?.count as Record<string, number> | undefined
            const active = statusCounts?.approved ?? 0
            const pending = statusCounts?.pending ?? 0
            return { all: active + pending, active, pending }
        },
        staleTime: 30_000,
        placeholderData: { all: 0, active: 0, pending: 0 },
        ...(opts?.refetchInterval !== undefined && { refetchInterval: opts.refetchInterval }),
    })
}
