import { describe, expect, it } from 'vitest'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createQueryClient, vueQueryOptions } from '@/core/api/query-client'

describe('createQueryClient', () => {
    it('returns a QueryClient instance', () => {
        expect(createQueryClient()).toBeInstanceOf(QueryClient)
    })

    it('configures the documented default query options', () => {
        const client = createQueryClient()
        const queries = client.getDefaultOptions().queries
        expect(queries?.staleTime).toBe(30_000)
        expect(queries?.retry).toBe(1)
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
