import type { ListParams } from '@/core/api/params'

export const reportKeys = {
    all: ['reports'] as const,
    lists: () => [...reportKeys.all, 'list'] as const,
    list: (params: ListParams) => [...reportKeys.lists(), params] as const,
    details: () => [...reportKeys.all, 'detail'] as const,
    detail: (id: string) => [...reportKeys.details(), id] as const,
    aggregates: () => [...reportKeys.all, 'aggregate'] as const,
    aggregate: (params: ListParams) => [...reportKeys.aggregates(), params] as const,
}
