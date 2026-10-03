import { computed, getCurrentScope, onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import { userKeys } from '@/resources/user/keys'
import { paginateParams, type ListParams } from '@/core/api/params'
import type { UserCounts, UserListResponse, UserRow } from '@/resources/user/model'

export function useUserList(params: MaybeRefOrGetter<ListParams>, opts?: {
    refetchInterval?: number
    enabled?: MaybeRefOrGetter<boolean>
}) {
    const api = useApi()
    return useQuery({
        queryKey: computed(() => userKeys.list(toValue(params))),
        enabled: computed(() => toValue(opts?.enabled) ?? true),
        queryFn: async (): Promise<UserListResponse> => {
            const res = await api.user.index(toValue(params))
            if (!res.ok) throw Object.assign(new Error('Failed to load users'), { status: res.status })
            return res.data
        },
        placeholderData: (prev) => prev,
        ...(opts?.refetchInterval !== undefined && { refetchInterval: opts.refetchInterval }),
    })
}

/**
 * Candidate users eligible for report membership: approved and non-guest. The
 * backend 422s pending/guest ids, so they are never offered. `GET /user` (LIST)
 * is open to any authenticated user in contract v1; only the other /user
 * endpoints are admin-only.
 */
export const MEMBER_CANDIDATE_PARAMS: ListParams = {
    'filter[status]': 'approved',
    'filter[role:in]': 'reporter,developer,admin',
    'include[]': ['name', 'initials'],
    'sort[name]': 'asc',
}

export function useMemberCandidates(opts?: { enabled?: MaybeRefOrGetter<boolean> }) {
    return useUserList(MEMBER_CANDIDATE_PARAMS, { enabled: opts?.enabled })
}

/** Debounce for the mention autocomplete - short enough to feel live, long enough to coalesce keystrokes. */
const MENTION_SEARCH_DEBOUNCE_MS = 250

/** Menu caps at 8 rows visually; one page of 10 covers it without over-fetching. */
const MENTION_SEARCH_PER_PAGE = 10

/**
 * Debounced `GET /user` search for the mention autocomplete.
 *
 * The bare-`@` case (empty query) fires immediately: `UEditorMentionMenu` runs with
 * `ignore-filter`, and its suggestion only intercepts Enter while it holds items. A
 * debounce delay there would leave the menu momentarily empty, so a quick Enter would
 * fall through to ProseMirror and insert a newline instead of selecting a candidate.
 *
 * Latest-wins: a newer call resolves the superseded caller with `[]`, cancels the
 * pending timer, and invalidates any in-flight request via a token so a stale
 * response can never overwrite the current results. Failures (non-ok or thrown)
 * also resolve `[]` - the menu simply stays closed.
 */
export function useUserMentionSearch(): (query: string) => Promise<UserRow[]> {
    const api = useApi()
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let settle: ((rows: UserRow[]) => void) | undefined
    let requestId = 0

    function settlePending(rows: UserRow[]): void {
        settle?.(rows)
        settle = undefined
    }

    function clearPendingTimer(): void {
        if (debounceTimer) {
            clearTimeout(debounceTimer)
            debounceTimer = undefined
        }
    }

    async function requestRows(query: string, id: number): Promise<UserRow[]> {
        try {
            // `search` allows ONLY the `like` operator (see User::querySchema());
            // the bare `filter[search]` key defaults to `eq` and 422s.
            const res = await api.user.index({
                ...MEMBER_CANDIDATE_PARAMS,
                ...paginateParams(1, MENTION_SEARCH_PER_PAGE),
                'filter[search:like]': query,
            })
            return id === requestId && res.ok ? res.data.data : []
        } catch {
            return []
        }
    }

    function searchNow(query: string, id: number): Promise<UserRow[]> {
        settle = undefined
        return requestRows(query, id)
    }

    function schedule(query: string, id: number): Promise<UserRow[]> {
        return new Promise<UserRow[]>((resolve) => {
            settle = resolve
            debounceTimer = setTimeout(() => { void searchNow(query, id).then(resolve) }, MENTION_SEARCH_DEBOUNCE_MS)
        })
    }

    if (getCurrentScope()) {
        onScopeDispose(() => {
            clearPendingTimer()
            settlePending([])
            requestId++
        })
    }

    return (query: string): Promise<UserRow[]> => {
        clearPendingTimer()
        settlePending([])
        const id = ++requestId
        return query === '' ? searchNow(query, id) : schedule(query, id)
    }
}

export function useUserTabCounts(params: MaybeRefOrGetter<ListParams>, opts?: {
    refetchInterval?: number
    enabled?: MaybeRefOrGetter<boolean>
}) {
    const api = useApi()
    return useQuery({
        queryKey: computed(() => [...userKeys.all, 'tabs', toValue(params)] as const),
        enabled: computed(() => toValue(opts?.enabled) ?? true),
        queryFn: async (): Promise<UserCounts> => {
            /**
             * Tab counts require the explicit aggregate[] param (else the backend
             * returns no counts). search + role are forwarded so tabs respect
             * those filters; status is intentionally excluded so the tabs
             * don't jump as you switch them.
             */
            const res = await api.user.aggregate({
                'aggregate[status:count]': 'approved,pending',
                ...toValue(params),
            })
            if (!res.ok) throw new Error('Failed to load user tab counts')
            const statusCounts = (res.data['status'] as Record<string, unknown>)?.count as Record<string, number> | undefined
            const active = statusCounts?.approved ?? 0
            const pending = statusCounts?.pending ?? 0
            return { all: active + pending, active, pending }
        },
        staleTime: 30_000,
        placeholderData: { all: 0, active: 0, pending: 0 },
        ...(opts?.refetchInterval !== undefined && { refetchInterval: opts.refetchInterval }),
    })
}
