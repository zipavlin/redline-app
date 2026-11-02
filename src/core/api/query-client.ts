import { QueryClient, VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'
import { isAuthDenialError } from '@/core/api/errors'

export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                // Auth denies (isAuthDenialError) are never retried - see core/api/errors.
                retry: (failureCount, error) => (isAuthDenialError(error) ? false : failureCount < 1),
                refetchOnWindowFocus: false,
            },
        },
    })
}

export function vueQueryOptions(queryClient: QueryClient = createQueryClient()): VueQueryPluginOptions {
    return { queryClient }
}

export { VueQueryPlugin }
