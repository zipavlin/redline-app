/**
 * Widget report selection — the widget's report *selection* + pin-list state.
 * Server data (dashboard lists/detail) lives in TanStack Query; the widget keeps
 * its pin list here because it is heavily mutated in place (drag-to-move,
 * optimistic updates, page-pixel decoration) which does not map cleanly onto a
 * query cache.
 */
import { reactive } from 'vue'
import type { Report } from '@/resources/report/model'

export type SelectedReport = Omit<Report, 'element'> & {
    _pageX?: number
    _pageY?: number
    element?: string | Element | null
}

export interface ReportSelection {
    list: SelectedReport[]
    loaded: boolean
    active: SelectedReport | null
    activeEl: HTMLElement | null
    pending: { pin: { x: number; y: number }; element: Element | null } | null
}

export function reportSlice() {
    const report = reactive<ReportSelection>({
        list: [],
        loaded: false,
        active: null,
        activeEl: null,
        pending: null,
    })

    function sortReports(key: keyof SelectedReport) {
        report.list.sort((a, b) => {
            const av = a[key] as unknown as string | number
            const bv = b[key] as unknown as string | number
            if (av < bv) return -1
            if (av > bv) return 1
            return 0
        })
    }

    function unloadReports() {
        report.list = []
        report.loaded = false
    }

    return { report, sortReports, unloadReports }
}
