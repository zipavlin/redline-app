/**
 * Widget store (useWidgetStore) - composes the shared slices
 * (auth/filter/settings) and adds the widget-only pieces:
 * capture mode, viewport, capabilities, url-scoped report loading, and
 * ?redline-report= / ?redline-filter= deep-link syncing.
 *
 * Data fetching now uses the grammar API (filter[]/include[]) directly.
 */
import { defineStore } from 'pinia'
import { inject, markRaw, nextTick, reactive, ref, watch } from 'vue'

import { getPinCoordinates } from '@/core/pin'
import { getUrlKey } from '@/core/url'
import { STATUSES } from '@/domain/status'
import { authSlice } from '@/store/partials/auth'
import { reportSlice, type SelectedReport } from '@/store/widget/selection'
import { settingsSlice } from '@/store/partials/settings'
import { WIDGET_LIST_INCLUDE, WIDGET_DETAIL_INCLUDE } from '@/resources/report/constants'
import type { RedlineContext } from '@/composables/useApi'
import type { Report } from '@/resources/report/model'
import type { Status } from '@/domain/status'

interface WidgetConfig {
    guest: boolean
    features: string[]
    [key: string]: unknown
}

const URL_FILTER_KEYS: string[] = ['all', 'unresolved', 'mine', ...STATUSES]

export const useWidgetStore = defineStore('redline-widget', () => {
    // State
    const redline = inject<RedlineContext>('redline') as RedlineContext
    const config = redline.config as WidgetConfig

    const { auth, activateSession } = authSlice(redline)
    const { report, sortReports, unloadReports } = reportSlice()
    const filter = reactive({ type: null as string | null, url: window.location.href })
    const { settings } = settingsSlice(redline)

    const mode = ref<'pin' | 'video' | 'annotation' | null>(null)
    const capturing = ref(false)
    const unresolvedCount = ref(0)

    const browser = reactive({
        viewport: { width: window.innerWidth, height: window.innerHeight },
    })
    const capabilities = reactive({ capture: false })

    // Watchers
    watch(() => report.active?.id, id => _syncUrlParam('redline-report', id ?? null))

    watch([() => report.loaded, () => filter.type], ([loaded, type]) => {
        _syncUrlParam('redline-filter', loaded && type && URL_FILTER_KEYS.includes(type) ? type : null)
    })

    watch(() => settings.expanded, async expanded => {
        if (!auth.user) return
        if (expanded) await loadReports('unresolved')
        else unloadReports()
    })

    let _urlHandled = false
    watch(() => auth.user, async user => {
        if (!user || _urlHandled) return
        _urlHandled = true
        refreshUnresolvedCount()
        const params = new URLSearchParams(location.search)
        const urlFilter = params.get('redline-filter')
        const urlReport = params.get('redline-report')
        if (urlFilter && URL_FILTER_KEYS.includes(urlFilter)) await loadReports(urlFilter)
        if (urlReport) await focusReport(urlReport)
        if (!urlFilter && !urlReport && settings.expanded) await loadReports('unresolved')
    }, { immediate: true })

    // Functions
    async function refreshUnresolvedCount() {
        try {
            const params: Record<string, string | string[]> = {
                'aggregate[status:count]': 'unresolved,resolved',
                'filter[location]': getUrlKey(),
            }
            const result = await redline.api.report.aggregate(params)
            if (result.ok && result.data['status'] && typeof result.data['status'] === 'object') {
                const counts = result.data['status'] as Record<string, number>
                unresolvedCount.value = counts.unresolved ?? 0
            }
        } catch { /** Network failure - no impact on UI beyond stale count */ }
    }

    function decorate(reportData: Report): SelectedReport {
        const coords = getPinCoordinates(reportData)
        return coords ? { ...reportData, _pageX: coords.pageX, _pageY: coords.pageY } : reportData
    }

    async function loadReports(type: string | null = null) {
        filter.url = getUrlKey()
        if (type !== null) filter.type = type
        try {
            const params: Record<string, string | string[]> = {
                ...WIDGET_LIST_INCLUDE,
                'filter[location]': filter.url,
            }
            if (filter.type && filter.type !== 'all') {
                params['filter[status]'] = filter.type
            }
            const result = await redline.api.report.list(params)
            if (!result.ok) return
            report.list = (result.data.data as unknown as Report[]).map(decorate)
            report.loaded = true
        } catch { /** Network failure - no impact on UI */ }
    }

    async function openReport(data: SelectedReport, pinEl: HTMLElement | null = null) {
        const initial: SelectedReport = { ...data }
        if (initial.pin?.prefer_selector && typeof initial.element === 'string') {
            /**
             * markRaw(null) throws, so resolve first and only markRaw a real node -
             * a selector that no longer matches (dynamic host DOM) falls back to null.
             */
            const el = document.querySelector(initial.element)
            initial.element = el ? markRaw(el) : null
        }
        report.active = initial
        if (pinEl !== null) report.activeEl = pinEl

        const res = await redline.api.report.show(data.id, { ...WIDGET_DETAIL_INCLUDE })
        if (!res.ok || report.active?.id !== data.id) return

        report.active = Object.assign(report.active, { ...res.data, element: report.active.element })

        const idx = report.list.findIndex(r => r.id === data.id)
        if (idx !== -1) report.list[idx] = { ...report.list[idx], ...res.data }
    }

    function closeReport() {
        report.active = null
        report.activeEl = null
    }

    async function focusReport(id: string) {
        let target = report.list.find(r => r.id === id)
        if (!target) {
            const res = await redline.api.report.show(id, { ...WIDGET_DETAIL_INCLUDE })
            if (!res.ok) return
            target = decorate(res.data)
            report.list = [...report.list, target]
        }
        await nextTick()
        if (target._pageY != null) {
            window.scrollTo({ top: target._pageY - window.innerHeight / 2, behavior: 'smooth' })
        }
        const pinEl = document.querySelector<HTMLElement>(`[data-report-id="${id}"]`)
        openReport(target, pinEl)
    }

    async function deleteReport(id: string): Promise<boolean> {
        const result = await redline.api.report.destroy(id)
        if (!result.ok) return false
        if (report.active?.id === id) {
            report.active = null
            report.activeEl = null
        }
        const idx = report.list.findIndex(r => r.id === id)
        if (idx !== -1) report.list.splice(idx, 1)
        return true
    }

    async function changeStatus(id: string, status: Status): Promise<boolean> {
        const result = await redline.api.report.status(id, status)
        if (!result.ok) return false
        if (report.active?.id === id) report.active = { ...report.active, status }
        const idx = report.list.findIndex(r => r.id === id)
        if (idx !== -1) report.list[idx] = { ...report.list[idx], status }
        return true
    }

    function _syncUrlParam(key: string, value: string | null) {
        const params = new URLSearchParams(location.search)
        if (value) params.set(key, value)
        else params.delete(key)
        const qs = params.toString()
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash)
    }

    function feature(name: string): boolean {
        return (config.features ?? []).includes(name)
    }

    return {
        auth, report, mode, capturing, browser, capabilities, filter, settings,
        unresolvedCount, refreshUnresolvedCount, activateSession, sortReports,
        unloadReports, loadReports, openReport, closeReport, focusReport,
        deleteReport, changeStatus, feature,
    }
})

/** Public shape of the widget store - used with `useStore<WidgetStore>()`. */
export type WidgetStore = ReturnType<typeof useWidgetStore>
