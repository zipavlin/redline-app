export const userKeys = {
    all: ['users'] as const,
    lists: () => [...userKeys.all, 'list'] as const,
    list: (params: import('@/core/api/params').ListParams) => [...userKeys.lists(), params] as const,
    detail: (id: string) => [...userKeys.all, 'detail', id] as const,
    overview: () => [...userKeys.all, 'overview'] as const,
}
