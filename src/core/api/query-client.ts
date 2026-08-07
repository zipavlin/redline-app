import { QueryClient, VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'

export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    })
}

export function vueQueryOptions(queryClient: QueryClient = createQueryClient()): VueQueryPluginOptions {
    return { queryClient }
}

export { VueQueryPlugin }
