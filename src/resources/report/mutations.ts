import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import { useStore, type SharedStore } from '@/composables/useStore'
import { getCleanUrl, getUrlKey } from '@/core/url'
import { getBrowserInfo } from '@/core/browser'
import { getCssSelector, resolveSelector } from '@/core/selector'
import { pagePixelsToPin, pinToElementPixels } from '@/domain/pin'
import type { Priority } from '@/domain/priority'
import { reportKeys } from '@/resources/report/keys'
import type { Member, Report } from '@/resources/report/model'

/**
 * Minimal store surface the body-update merge writes back to. The widget and
 * dashboard stores both expose `report.active` + `report.list`, but their entry
 * types differ (SelectedReport vs DashboardReportRow) - the loose index signature
 * keeps this resource-layer code store-agnostic (resources/ must not import store/).
 */
export interface ReportStoreEntry {
    id: string
    members?: Member[]
    members_count?: number
    members_exists?: boolean
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
 * Write the server's authoritative member list into the active Pinia report and
 * its list row. The list row keeps the full list plus the derived count/exists
 * flags so the dashboard badge stays in sync.
 */
export function applyMembersToStore(store: ReportStoreLike, id: string, members: Member[]): void {
    const fields = { members, members_count: members.length, members_exists: members.length > 0 }
    if (store.report.active?.id === id) Object.assign(store.report.active, fields)
    const row = store.report.list.find((entry) => entry.id === id)
    if (row) Object.assign(row, fields)
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

/** DELETE report/{id} - dashboard usage (caller closes the active panel). */
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

/**
 * PATCH report/{id}/priority. Same invalidations as the status mutation, plus a
 * Pinia merge of the fresh row (like the body mutation) so the active dashboard
 * report reflects the new priority without a reopen.
 */
export function useReportPriorityMutation() {
    const api = useApi()
    const qc = useQueryClient()
    const store = useStore<SharedStore & ReportStoreLike>()
    return useMutation({
        mutationFn: async ({ id, priority }: { id: string; priority: string }): Promise<Report> => {
            const res = await api.report.priority(id, priority)
            if (!res.ok) throw new Error('Failed to change priority')
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

interface MemberMutationVariables {
    id: string
    userIds: string[]
    optimistic?: Member[]
}

interface MemberFields {
    members?: Member[]
    members_count?: number
    members_exists?: boolean
}

interface MemberMutationContext {
    previous: { active: MemberFields | null; row: MemberFields | null }
}

function readMemberFields(entry: ReportStoreEntry | null | undefined): MemberFields | null {
    if (!entry) return null
    return {
        members: entry.members,
        members_count: entry.members_count,
        members_exists: entry.members_exists,
    }
}

function snapshotMembers(store: ReportStoreLike, id: string): MemberMutationContext['previous'] {
    const active = store.report.active?.id === id ? readMemberFields(store.report.active) : null
    return { active, row: readMemberFields(store.report.list.find((entry) => entry.id === id)) }
}

function restoreMembers(store: ReportStoreLike, id: string, previous: MemberMutationContext['previous']): void {
    if (previous.active && store.report.active?.id === id) Object.assign(store.report.active, previous.active)
    if (previous.row) {
        const row = store.report.list.find((entry) => entry.id === id)
        if (row) Object.assign(row, previous.row)
    }
}

function mergeMembers(current: Member[], entries: Member[]): Member[] {
    const byId = new Map(current.map((member) => [member.id, member]))
    for (const entry of entries) byId.set(entry.id, entry)
    return [...byId.values()]
}

function optimisticMembers(current: Member[], kind: 'add' | 'remove', userIds: string[], entries: Member[]): Member[] {
    return kind === 'add'
        ? mergeMembers(current, entries)
        : current.filter((member) => !userIds.includes(member.id))
}

interface OptimisticMembersInput {
    id: string
    kind: 'add' | 'remove'
    userIds: string[]
    entries: Member[]
}

function applyOptimisticMembers(store: ReportStoreLike, { id, kind, userIds, entries }: OptimisticMembersInput): void {
    const targets: ReportStoreEntry[] = []
    if (store.report.active?.id === id) targets.push(store.report.active)
    const row = store.report.list.find((entry) => entry.id === id)
    if (row) targets.push(row)
    for (const target of targets) {
        const current = target.members ?? []
        const next = optimisticMembers(current, kind, userIds, entries)
        Object.assign(target, { members: next, members_count: next.length, members_exists: next.length > 0 })
    }
}

/**
 * Shared add/remove member mutation. `kind` selects the endpoint; the optimistic
 * merge, rollback snapshot, and cache invalidation are identical for both.
 */
export function useMemberMutation(kind: 'add' | 'remove') {
    const api = useApi()
    const qc = useQueryClient()
    const store = useStore<SharedStore & ReportStoreLike>()
    const callApi = kind === 'add'
        ? (id: string, userIds: string[]) => api.report.addMembers(id, userIds)
        : (id: string, userIds: string[]) => api.report.removeMembers(id, userIds)

    return useMutation<Member[], Error, MemberMutationVariables, MemberMutationContext>({
        mutationFn: async ({ id, userIds }) => {
            const res = await callApi(id, userIds)
            if (!res.ok) {
                throw Object.assign(new Error('Failed to update members'), { response: res })
            }
            return res.data.members
        },
        onMutate: async ({ id, userIds, optimistic }) => {
            await qc.cancelQueries({ queryKey: reportKeys.detail(id) })
            await qc.cancelQueries({ queryKey: reportKeys.lists() })
            const previous = snapshotMembers(store, id)
            applyOptimisticMembers(store, { id, kind, userIds, entries: optimistic ?? [] })
            return { previous }
        },
        onError: (_error, { id }, context) => {
            if (context) restoreMembers(store, id, context.previous)
        },
        onSuccess: (members, { id }) => {
            applyMembersToStore(store, id, members)
            qc.invalidateQueries({ queryKey: reportKeys.lists() })
            qc.invalidateQueries({ queryKey: reportKeys.detail(id) })
        },
    })
}

export function useAddMembersMutation() {
    return useMemberMutation('add')
}

export function useRemoveMembersMutation() {
    return useMemberMutation('remove')
}

/**
 * Map a member-mutation failure to a user-facing toast title: 422 uses the
 * server's message, 403 is a permission failure, anything else is the fallback.
 */
export function memberMutationError(error: unknown, fallback = 'Could not update members'): string {
    const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response
    if (response?.status === 422 && response.data?.message) return response.data.message
    if (response?.status === 403) return 'You do not have permission to change members'
    return fallback
}

export interface CreateReportInput {
    body: string
    priority?: Priority
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

            if (input.priority) payload.priority = input.priority

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

            /**
             * Screenshot attach is best-effort: the report is already saved, so a
             * failed upload must not fail the mutation (no false failure). Warn
             * instead - a partial-success toast is deliberately out of scope here.
             */
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
