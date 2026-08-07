/**
 * Shared mount harness for RESOURCES-layer tests (query composables + mutations).
 *
 * Mirrors the convention established in tests/resources/report/mutations.test.ts:
 * a fresh QueryClient (retry:false) and a fresh injected `redline.api` mock per
 * test, mounted into a throwable component so composables run inside an active
 * Vue setup() context. Each call produces brand-new state - never share a client
 * or api between tests.
 *
 * Also exports small helpers for API-factory tests (URL/param/body contract
 * assertions), a controllable-promise factory, and DOM restoration.
 */
import { defineComponent } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { expect, vi, type Mock } from 'vitest'
import type { ApiClient } from '@/core/api/client'

/** Loose api mock shape: namespace → method → vi.fn(). */
export type ApiShape = Record<string, Record<string, Mock>>

export interface MountedResource<T> {
    wrapper: VueWrapper
    api: ApiShape
    queryClient: QueryClient
    result: T
}

const mountedWrappers: VueWrapper[] = []

/**
 * Mount a throwable component running `setup(api)` and return the fresh
 * QueryClient, api mocks and the composable result. The wrapper is tracked and
 * unmounted by `unmountResources()` (call from `afterEach`).
 *
 * `configure` runs after the api is built but BEFORE the component mounts -
 * required for query composables, whose first fetch fires during setup().
 */
export function mountResource<T>(
    setup: (api: ApiShape) => T,
    makeApi: () => ApiShape = () => ({}),
    configure?: (api: ApiShape) => void,
): MountedResource<T> {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = makeApi()
    configure?.(api)
    let result!: T
    const wrapper = mount(
        defineComponent({
            setup() {
                result = setup(api)
                return {}
            },
            template: '<div />',
        }),
        {
            global: {
                plugins: [[VueQueryPlugin, { queryClient }]],
                provide: { redline: { api, config: {} } },
            },
        },
    )
    mountedWrappers.push(wrapper)
    return { wrapper, api, queryClient, result }
}

/** Unmount every wrapper created by `mountResource` - call from `afterEach`. */
export function unmountResources(): void {
    while (mountedWrappers.length) mountedWrappers.pop()?.unmount()
}

/** Minimal mock of the ApiClient surface the resource factories call into. */
export function createClient() {
    return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as unknown as ApiClient
}

/**
 * Assert a factory-built URL against its decoded path + query. Comparison is
 * encoding-normalized (URLSearchParams) so escaping/ordering differences don't
 * make the contract lock brittle.
 */
export function expectPathAndQuery(url: string, path: string, query: string): void {
    const [p, qs = ''] = url.split('?')
    expect(p).toBe(path)
    expect(new URLSearchParams(qs).toString()).toBe(new URLSearchParams(query).toString())
}

/** Controllable promise for asserting in-flight state (loading/placeholders). */
export function deferred<T = unknown>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

/** Drop own-property scroll dimensions so the prototype getters re-apply. */
export function restoreScrollDimensions(): void {
    delete (document.documentElement as unknown as Record<string, unknown>).scrollWidth
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight
}
