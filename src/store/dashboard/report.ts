/**
 * Dashboard report slice - owns report list state, filters, sort, pagination,
 * and active report selection with detail loading.
 */
import { reactive } from 'vue'
import type { RedlineContext } from '@/composables/useApi'
import type { DashboardReportRow, Report } from '@/resources/report/model'
import type { ListParams, SortDir } from '@/core/api/params'
import {
    filterParams,
    paginateParams,
    sortParams,
    mergeParams,
} from '@/core/api/params'
import { DASHBOARD_LIST_INCLUDE, DASHBOARD_DETAIL_INCLUDE } from '@/resources/report/constants'

export type ReportStatusGroup = 'all' | 'unresolved' | 'resolved'

export interface ReportFilter {
    statusGroup: ReportStatusGroup
    search: string
    mine: boolean
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

export function reportSlice(redline: RedlineContext) {
    const report = reactive<ReportSliceState>({
        list: [],
        loaded: false,
        active: null,
        filter: {
            statusGroup: 'all',
            search: '',
            mine: false,
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
        if (report.filter.search) parts.push(filterParams('body', report.filter.search, 'like'))
        if (report.filter.mine) parts.push(filterParams('mine', '1'))
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
