import { describe, expect, it } from 'vitest'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ApiResponseError } from '@/core/api/errors'
import { createQueryClient, vueQueryOptions } from '@/core/api/query-client'

describe('createQueryClient', () => {
    it('returns a QueryClient instance', () => {
        expect(createQueryClient()).toBeInstanceOf(QueryClient)
    })

    it('configures the documented default query options', () => {
        const client = createQueryClient()
        const queries = client.getDefaultOptions().queries
        expect(queries?.staleTime).toBe(30_000)
        expect(queries?.retry).toBeTypeOf('function')
        expect(queries?.refetchOnWindowFocus).toBe(false)
    })
})

describe('vueQueryOptions', () => {
    it('creates a default QueryClient when none is passed', () => {
        const options = vueQueryOptions()
        expect(options.queryClient).toBeInstanceOf(QueryClient)
        expect(options.queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000)
    })

    it('returns the passed client untouched', () => {
        const client = createQueryClient()
        expect(vueQueryOptions(client).queryClient).toBe(client)
    })
})

describe('VueQueryPlugin re-export', () => {
    it('exposes the VueQueryPlugin for app.use()', () => {
        expect(VueQueryPlugin).toBeTruthy()
        expect(typeof VueQueryPlugin.install).toBe('function')
    })
})

describe('retry policy', () => {
    /** Drive a failing fetch through the real options: one retry delay (1s) then the final rejection. */
    async function attemptsFor(error: unknown): Promise<number> {
        vi.useFakeTimers()
        try {
            const client = createQueryClient()
            let attempts = 0
            const failing = vi.fn(async () => {
                attempts++
                throw error
            })
            const settled = client.fetchQuery({ queryKey: ['attempts'], queryFn: failing }).catch(() => {})
            await vi.advanceTimersByTimeAsync(2000)
            await settled
            return attempts
        } finally {
            vi.useRealTimers()
        }
    }

    it('never retries an auth deny (403/419) and treats a plain 401 as retryable', async () => {
        expect(await attemptsFor(new ApiResponseError('Denied', 403))).toBe(1)
        expect(await attemptsFor(new ApiResponseError('Denied', 419))).toBe(1)
        expect(await attemptsFor({ status: 403 })).toBe(1)
        expect(await attemptsFor(new ApiResponseError('Denied', 401))).toBe(2)
    })

    it('keeps exactly one retry for failure shapes that are not auth denies', async () => {
        expect(await attemptsFor(new Error('network down'))).toBe(2)
        expect(await attemptsFor(new ApiResponseError('Boom', 500))).toBe(2)
        expect(await attemptsFor(new ApiResponseError('Boom', 404))).toBe(2)
    })
})
