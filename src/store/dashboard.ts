/**
 * Dashboard store (useDashboardStore) - composes domain slices (report, users)
 * with shared slices (auth, settings). Each domain owns its own filter, sort,
 * pagination, and active-item state.
 */
import { defineStore } from 'pinia'
import { inject } from 'vue'

import { authSlice } from '@/store/partials/auth'
import { settingsSlice } from '@/store/partials/settings'
import { reportSlice } from '@/store/dashboard/report'
import { usersSlice } from '@/store/dashboard/users'
import type { RedlineContext } from '@/composables/useApi'

export type { ReportStatusGroup, ReportFilter, ReportDueFilter } from '@/store/dashboard/report'
export type { UserStatusGroup, UserFilter } from '@/store/dashboard/users'

export const useDashboardStore = defineStore('redline-dashboard', () => {
    // State
    const redline = inject<RedlineContext>('redline') as RedlineContext

    const { auth, activateSession } = authSlice(redline)
    const { settings } = settingsSlice(redline)
    const { report, reportFilterParams, reportListParams, openReport, closeReport } = reportSlice(redline, auth)
    const { users, userListParams, openUser, closeUser } = usersSlice(redline)

    // Functions
    function feature(name: string): boolean {
        return ((redline?.config.features as string[]) ?? []).includes(name)
    }

    function getUrlWithQuery(base: string | null = null, query: Record<string, string | number> = {}): string {
        if (!base) return ''
        const parts = Object.entries(query).map(([key, value]) => `${key}=${value}`)
        return `${base}${base.includes('?') ? '&' : '?'}${parts.join('&')}`
    }

    return {
        auth,
        activateSession,
        settings,
        report,
        reportFilterParams,
        reportListParams,
        openReport,
        closeReport,
        users,
        userListParams,
        openUser,
        closeUser,
        feature,
        getUrlWithQuery,
    }
})

/** Public shape of the dashboard store - used with `useStore<DashboardStore>()`. */
export type DashboardStore = ReturnType<typeof useDashboardStore>
