import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import { useStore, type SharedStore } from '@/composables/useStore'
import { getCleanUrl, getUrlKey } from '@/core/url'
import { getBrowserInfo } from '@/core/browser'
import { getCssSelector, resolveSelector } from '@/core/selector'
import { pagePixelsToPin, pinToElementPixels } from '@/domain/pin'
import { reportKeys } from '@/resources/report/keys'
import type { Report } from '@/resources/report/model'

/**
 * Minimal store surface the body-update merge writes back to. The widget and
 * dashboard stores both expose `report.active` + `report.list`, but their entry
 * types differ (SelectedReport vs DashboardReportRow) — the loose index signature
 * keeps this resource-layer code store-agnostic (resources/ must not import store/).
 */
export interface ReportStoreEntry {
    id: string
    [key: string]: unknown
}

export interface ReportStoreLike {
    report: {
        active: ReportStoreEntry | null
        list: ReportStoreEntry[]
    }
}

/**
 * Merge a `fresh()->toArray()` PATCH response into an existing report entry
 * without clobbering client-side transient fields the response cannot carry:
 * the loaded `author` (the response may lack it), the widget's page-pixel
 * decoration (`_pageX`/`_pageY`) and the resolved `element` (the backend echoes
 * a selector string, never the DOM node).
 */
export function mergeReportPayload(existing: ReportStoreEntry, resp: Report): ReportStoreEntry {
    return {
        ...existing,
        ...resp,
        author: resp.author ?? existing.author,
        _pageX: existing._pageX,
        _pageY: existing._pageY,
        element: existing.element,
    }
}

function mergeReportIntoStore(store: ReportStoreLike, resp: Report, id: string): void {
    if (store.report.active?.id === id) {
        store.report.active = mergeReportPayload(store.report.active, resp)
    }
    const idx = store.report.list.findIndex((row) => row.id === id)
    if (idx !== -1) {
        store.report.list[idx] = mergeReportPayload(store.report.list[idx], resp)
    }
}

/**
 * PATCH report/{id} with a new body. On success the returned report is merged
 * into the active Pinia report AND its list entry (widget + dashboard), then the
 * TanStack report lists/detail/aggregates are invalidated. The Pinia merge is
 * mandatory here because active reports live in Pinia (loaded by direct API
 * calls), not in the query cache.
 */
export function useUpdateReportBodyMutation() {
    const api = useApi()
    const qc = useQueryClient()
    const store = useStore<SharedStore & ReportStoreLike>()
    return useMutation({
        mutationFn: async ({ id, body }: { id: string; body: string }): Promise<Report> => {
            const res = await api.report.update(id, body)
            if (!res.ok) throw new Error('Failed to update report body')
            return res.data
        },
        onSuccess: (data, { id }) => {
            mergeReportIntoStore(store, data, id)
            qc.invalidateQueries({ queryKey: reportKeys.lists() })
            qc.invalidateQueries({ queryKey: reportKeys.detail(id) })
            qc.invalidateQueries({ queryKey: reportKeys.aggregates() })
        },
    })
}

/** DELETE report/{id} — dashboard usage (caller closes the active panel). */
export function useDeleteReportMutation() {
    const api = useApi()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const res = await api.report.destroy(id)
            if (!res.ok) throw new Error('Failed to delete report')
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: reportKeys.lists() })
            qc.invalidateQueries({ queryKey: reportKeys.aggregates() })
        },
    })
}

export function useReportStatusMutation() {
    const api = useApi()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }): Promise<Report> => {
            const res = await api.report.status(id, status)
            if (!res.ok) throw new Error('Failed to change status')
            return res.data
        },
        onSuccess: (_data, { id }) => {
            qc.invalidateQueries({ queryKey: reportKeys.lists() })
            qc.invalidateQueries({ queryKey: reportKeys.detail(id) })
            qc.invalidateQueries({ queryKey: reportKeys.aggregates() })
        },
    })
}

export interface CreateReportInput {
    body: string
    pin?: { x: number; y: number; scroll_x?: number; scroll_y?: number } | null
    element?: Element | null
    screenshot?: Blob | null
    video?: Blob | null
}

export function useCreateReport() {
    const api = useApi()
    const qc = useQueryClient()

    return useMutation({
        mutationFn: async (input: CreateReportInput): Promise<Report> => {
            const payload: Record<string, unknown> = {
                url: getCleanUrl(),
                location: getUrlKey(),
                body: input.body,
                browser: getBrowserInfo(),
            }

            if (input.element instanceof Element) {
                const selector = getCssSelector(input.element)
                const verified = selector ? resolveSelector(selector) === input.element : false
                if (verified && input.pin) {
                    payload.element = selector
                    payload.pin = { ...input.pin, prefer_selector: true }
                } else if (input.pin) {
                    const rect = input.element.getBoundingClientRect()
                    const { pageX, pageY } = pinToElementPixels(input.pin, rect, window.scrollX, window.scrollY)
                    const { x, y } = pagePixelsToPin(pageX, pageY, document.documentElement.scrollWidth, document.documentElement.scrollHeight)
                    payload.pin = { x, y, prefer_selector: false }
                }
            } else if (input.pin) {
                payload.pin = { ...input.pin }
            }

            const result = await api.report.store(payload)
            if (!result.ok) {
                throw Object.assign(new Error('Report store failed'), { response: result })
            }
            const saved = result.data

            // Screenshot attach is best-effort: the report is already saved, so a
            // failed upload must not fail the mutation (no false failure). Warn
            // instead — a partial-success toast is deliberately out of scope here.
            if (input.screenshot) {
                try {
                    const screenshotResult = await api.screenshot.store(saved.id, input.screenshot)
                    if (!screenshotResult.ok) {
                        console.warn('[redline] screenshot upload failed', { status: screenshotResult.status })
                    }
                } catch (err) {
                    console.warn('[redline] screenshot upload threw', err)
                }
            }

            if (input.video) {
                const videoResult = await api.video.store(saved.id, input.video)
                if (!videoResult.ok) {
                    throw Object.assign(
                        new Error(`Video upload failed (HTTP ${videoResult.status})`),
                        { response: videoResult },
                    )
                }
            }

            return saved
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: reportKeys.lists() })
            qc.invalidateQueries({ queryKey: reportKeys.aggregates() })
        },
    })
}
