import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import type { ListParams } from '@/core/api/params'
import { reportKeys } from '@/resources/report/keys'
import type { AggregateResult } from '@/core/api/types'
import type { ReportListResponse } from '@/resources/report/model'

export function useReportList(params: MaybeRefOrGetter<ListParams>, opts?: {
    refetchInterval?: number
}) {
    const api = useApi()
    return useQuery({
        queryKey: computed(() => reportKeys.list(toValue(params))),
        queryFn: async (): Promise<ReportListResponse> => {
            const res = await api.report.list(toValue(params))
            if (!res.ok) throw new Error('Failed to load reports')
            return res.data
        },
        placeholderData: (prev) => prev,
        ...(opts?.refetchInterval !== undefined && { refetchInterval: opts.refetchInterval }),
    })
}

export function useReportAggregate<T = AggregateResult>(
    params: MaybeRefOrGetter<ListParams>,
    opts?: {
        select?: (data: AggregateResult) => T
        staleTime?: number
        refetchInterval?: number
        key?: unknown[]
    },
) {
    const api = useApi()
    return useQuery({
        queryKey: computed(() =>
            opts?.key
                ? [...reportKeys.aggregate(toValue(params)), ...opts.key]
                : reportKeys.aggregate(toValue(params))
        ),
        queryFn: async (): Promise<AggregateResult> => {
            const res = await api.report.aggregate(toValue(params))
            if (!res.ok) throw new Error('Failed to load aggregates')
            return res.data
        },
        ...(opts?.select && { select: opts.select }),
        ...(opts?.staleTime !== undefined && { staleTime: opts.staleTime }),
        ...(opts?.refetchInterval !== undefined && { refetchInterval: opts.refetchInterval }),
    })
}
