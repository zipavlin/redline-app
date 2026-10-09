/**
 * Dashboard report slice - owns report list state, filters, sort, pagination,
 * and active report selection with detail loading.
 */
import { reactive } from 'vue'
import type { RedlineContext } from '@/composables/useApi'
import type { AuthState } from '@/store/partials/auth'
import type { DashboardReportRow, Report } from '@/resources/report/model'
import type { Priority } from '@/domain/priority'
import type { ListParams, SortDir } from '@/core/api/params'
import {
    filterParams,
    paginateParams,
    sortParams,
    mergeParams,
} from '@/core/api/params'
import { DASHBOARD_LIST_INCLUDE, DASHBOARD_DETAIL_INCLUDE } from '@/resources/report/constants'

export type ReportStatusGroup = 'all' | 'unresolved' | 'resolved'

/** Dashboard due-date filter - maps to the backend's virtual `filter[due]` enum. */
export type ReportDueFilter = 'any' | 'overdue' | 'due_soon' | 'none'

export interface ReportFilter {
    statusGroup: ReportStatusGroup
    priority: 'any' | Priority
    dueState: ReportDueFilter
    search: string
    mine: boolean
    assignedToMe: boolean
    memberIds: string[]
    dateFrom: string | null
    dateTo: string | null
    userId: string | null
    hasMedia: boolean
    hasComments: boolean
    location: string | null
}

export interface ReportSliceState {
    list: DashboardReportRow[]
    loaded: boolean
    active: Report | null
    filter: ReportFilter
    sort: string
    dir: SortDir
    page: { page: number; perPage: number }
}

export function reportSlice(redline: RedlineContext, auth: AuthState) {
    const report = reactive<ReportSliceState>({
        list: [],
        loaded: false,
        active: null,
        filter: {
            statusGroup: 'all',
            priority: 'any',
            dueState: 'any',
            search: '',
            mine: false,
            assignedToMe: false,
            memberIds: [],
            dateFrom: null,
            dateTo: null,
            userId: null,
            hasMedia: false,
            hasComments: false,
            location: null,
        },
        sort: 'created_at',
        dir: 'desc',
        page: { page: 1, perPage: 15 },
    })

    // Functions
    /** Build only the filter param subset - shared by list + aggregate queries. */
    function reportFilterParams(): ListParams {
        const parts: ListParams[] = []
        if (report.filter.statusGroup !== 'all') parts.push(filterParams('status', report.filter.statusGroup))
        if (report.filter.priority !== 'any') parts.push(filterParams('priority', report.filter.priority))
        // Backend's virtual `due` enum; the raw filter[due_at] power-user ops are never sent by the UI.
        if (report.filter.dueState !== 'any') parts.push(filterParams('due', report.filter.dueState))
        if (report.filter.search) parts.push(filterParams('body', report.filter.search, 'like'))
        if (report.filter.mine) parts.push(filterParams('mine', '1'))
        // Backend removed filter[assigned]; "assigned to me" is client-side now.
        if (report.filter.assignedToMe && auth.user?.id) parts.push(filterParams('member', auth.user.id))
        if (report.filter.memberIds.length) parts.push(filterParams('member', report.filter.memberIds.join(','), 'in'))
        if (report.filter.dateFrom) parts.push(filterParams('created_at', report.filter.dateFrom, 'from'))
        if (report.filter.dateTo) parts.push(filterParams('created_at', report.filter.dateTo, 'to'))
        if (report.filter.userId) parts.push(filterParams('author', report.filter.userId))
        if (report.filter.hasMedia) parts.push(filterParams('screenshot', '1', 'exists'))
        if (report.filter.hasComments) parts.push(filterParams('comments', '1', 'exists'))
        if (report.filter.location) parts.push(filterParams('location', report.filter.location))
        return mergeParams(...parts)
    }

    function reportListParams(): ListParams {
        return mergeParams(
            paginateParams(report.page.page, report.page.perPage),
            { ...DASHBOARD_LIST_INCLUDE },
            report.sort ? sortParams(report.sort, report.dir) : {},
            reportFilterParams(),
        )
    }

    async function openReport(id: string): Promise<void> {
        try {
            const res = await redline.api.report.show(id, { ...DASHBOARD_DETAIL_INCLUDE })
            if (!res.ok) return
            report.active = res.data as Report
        } catch { /** Network failure - no impact on UI */ }
    }

    function closeReport(): void {
        report.active = null
    }

    return { report, reportFilterParams, reportListParams, openReport, closeReport }
}
