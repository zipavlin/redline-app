import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { useDashboardStore } from '@/store/dashboard'

function createRedline() {
    return {
        config: { features: ['comments', 'mentions'] },
        api: {
            auth: {
                me: vi.fn().mockRejectedValue(new Error('no session')),
                refresh: vi.fn(),
            },
            report: { show: vi.fn() },
            user: { show: vi.fn() },
        },
    } as any
}

/** Mount the dashboard store the way production does: within the app context so
 *  its inject('redline') resolves (cf. src/dashboard.ts). */
function mountDashboardStore(redline = createRedline()) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const app = createApp({ render: () => null })
    app.use(pinia)
    app.provide('redline', redline)
    const store = app.runWithContext(() => useDashboardStore())
    return { store, redline }
}

describe('useDashboardStore', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('composes the shared slices onto the store', () => {
        const { store } = mountDashboardStore()

        expect(store.auth.user).toBeNull()
        expect(store.settings.theme).toBe('dark')
        expect(store.report).toBeDefined()
        expect(store.reportListParams).toBeTypeOf('function')
        expect(store.users).toBeDefined()
        expect(store.userListParams).toBeTypeOf('function')
        expect(store.openReport).toBeTypeOf('function')
        expect(store.openUser).toBeTypeOf('function')
    })

    describe('feature()', () => {
        it('returns true when the feature is enabled in the config', () => {
            const { store } = mountDashboardStore()
            expect(store.feature('comments')).toBe(true)
            expect(store.feature('mentions')).toBe(true)
        })

        it('returns false for unknown features', () => {
            const { store } = mountDashboardStore()
            expect(store.feature('screenshots')).toBe(false)
            expect(store.feature('videos')).toBe(false)
        })

        it('returns false when the config carries no features', () => {
            const redline = createRedline()
            delete redline.config.features
            const { store } = mountDashboardStore(redline)
            expect(store.feature('comments')).toBe(false)
        })
    })

    describe('getUrlWithQuery()', () => {
        it('returns an empty string for a falsy base', () => {
            const { store } = mountDashboardStore()
            expect(store.getUrlWithQuery()).toBe('')
            expect(store.getUrlWithQuery(null)).toBe('')
        })

        it('appends a single query entry with ?', () => {
            const { store } = mountDashboardStore()
            expect(store.getUrlWithQuery('/redline/reports', { page: 2 })).toBe('/redline/reports?page=2')
        })

        it('joins multiple entries with &', () => {
            const { store } = mountDashboardStore()
            expect(store.getUrlWithQuery('/redline/reports', { page: 2, per: 10 })).toBe('/redline/reports?page=2&per=10')
        })

        it('switches to & when the base already carries a query string', () => {
            const { store } = mountDashboardStore()
            expect(store.getUrlWithQuery('/redline/reports?status=new', { page: 2 })).toBe('/redline/reports?status=new&page=2')
        })

        it('stringifies numeric values', () => {
            const { store } = mountDashboardStore()
            expect(store.getUrlWithQuery('/x', { page: 1.5 })).toBe('/x?page=1.5')
            expect(store.getUrlWithQuery('/x', { page: 0 })).toBe('/x?page=0')
        })

        it('leaves a bare ? when no query entries are given', () => {
            const { store } = mountDashboardStore()
            expect(store.getUrlWithQuery('/redline/reports')).toBe('/redline/reports?')
        })
    })
})
