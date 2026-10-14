/**
 * Shared dashboard-table behavior for the Reports and Users tables: row
 * selection, ↑/↓ keyboard navigation, page-crossing intent, filter/sort reset
 * watchers, server-side sort state, and column visibility. Each table keeps its
 * own filters, aggregates, and column definitions local.
 *
 * Store-specific shapes are deliberately avoided - the composable reads/writes
 * small structural slices (`page`, `sort`) and calls back into the store via
 * `select`/`clear`, so it stays app-agnostic.
 */
import { computed, h, nextTick, onMounted, ref, watch } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import type { DropdownMenuItem, TableRow } from '@nuxt/ui'

export type TableSortDir = 'asc' | 'desc'

export interface DashboardTableOptions<T> {
    /** Getter for the current (already sorted/paginated) rows. */
    rows: () => T[]
    /** Getter for the last page number. */
    lastPage: () => number
    /** Reactive page state (the store slice's `.page`). The composable reads and writes `.page`. */
    page: { page: number }
    /** Reactive sort state (the store slice's `.sort`/`.dir`). */
    sort: { sort: string; dir: TableSortDir }
    /** Getter for the filter/sort values that should reset to page 1. */
    resetSource: () => unknown[]
    /** Called when the highlighted row changes to a real row. */
    select: (row: T) => void
    /** Called when the highlight is cleared. */
    clear: () => void
    /** Optional getter for an externally closable active row - clears the highlight when it becomes null. */
    active?: () => unknown
    /** Column ids/labels shown in the column-visibility menu. */
    toggleableColumns: { id: string; label: string }[]
}

export function useDashboardTable<T>(options: DashboardTableOptions<T>) {
    const {
        rows,
        lastPage,
        page,
        sort,
        resetSource,
        select,
        clear,
        active,
        toggleableColumns,
    } = options

    // State
    /**
     * highlightedIndex is the single source of truth; the active row is derived
     * from it, inbox-style, so the details panel follows the cursor.
     */
    const highlightedIndex = ref(-1)
    /**
     * Where to land after ↑/↓ crosses a page boundary; the refetch is async, so
     * the intent is recorded here and applied once the new rows arrive.
     */
    const pendingEdge = ref<'first' | 'last' | null>(null)

    const tableWrapper = ref<HTMLElement | null>(null)
    const columnVisibility = ref<Record<string, boolean>>({})

    // Computed
    const columnMenuItems = computed<DropdownMenuItem[][]>(() => [
        toggleableColumns.map(c => ({
            label: c.label,
            type: 'checkbox' as const,
            checked: columnVisibility.value[c.id] !== false,
            onUpdateChecked: (value: boolean) => { columnVisibility.value = { ...columnVisibility.value, [c.id]: value } },
            onSelect: (e: Event) => e.preventDefault(),
        })),
    ])

    const tableMeta = computed(() => ({
        class: {
            tr: (row: TableRow<T>) => [
                'cursor-pointer',
                row.index === highlightedIndex.value ? 'bg-elevated' : '',
            ].join(' '),
        },
    }))

    // Watchers
    // Focus the table wrapper so ↑/↓ work without clicking a row first.
    onMounted(() => tableWrapper.value?.focus())

    watch(highlightedIndex, (i) => {
        const row = rows()[i] ?? null
        if (row) select(row)
        else clear()
        scrollHighlightIntoView(i)
    })

    /**
     * The details panel can close the active row externally (X button) without
     * changing `highlightedIndex` - mirror the external close back to the highlight.
     */
    if (active) {
        watch(active, (value) => {
            if (value === null && highlightedIndex.value !== -1) {
                highlightedIndex.value = -1
            }
        })
    }

    // New rows landed: honour a pending page cross, otherwise just keep the index in range.
    watch(rows, (list) => {
        if (pendingEdge.value) {
            highlightedIndex.value = list.length ? (pendingEdge.value === 'first' ? 0 : list.length - 1) : -1
            pendingEdge.value = null
        } else if (highlightedIndex.value > list.length - 1) {
            highlightedIndex.value = list.length - 1
        }
    })

    // A manual pagination jump drops the selection; an ↑/↓ page cross keeps its landing intent.
    watch(() => page.page, () => {
        if (!pendingEdge.value) highlightedIndex.value = -1
    })

    // Reset to page 1 whenever a filter or sort changes.
    watch(resetSource, () => {
        page.page = 1
        highlightedIndex.value = -1
    })

    // Functions
    // Server-side sorting.
    /**
     * The list is paginated by the API, so TanStack's own sorting would just
     * reorder the current page. toggleSort writes the sort slice, which flows
     * into the list params -> query key -> refetch.
     */
    function toggleSort(key: string) {
        if (sort.sort === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
        else {
            sort.sort = key
            sort.dir = 'desc'
        }
    }

    function sortIcon(key: string): string {
        if (sort.sort !== key) return 'i-lucide-arrow-up-down'
        return sort.dir === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow'
    }

    /**
     * A header that toggles the server sort for `key` and reflects its direction.
     * UButton is a direct import - Nuxt UI registers U* components for templates
     * only, so resolveComponent would hand back an unresolvable name here.
     */
    function sortableHeader(key: string, label: string) {
        return () => h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            label,
            icon: sortIcon(key),
            class: '-mx-2.5',
            onClick: () => toggleSort(key),
        })
    }

    // Row selection + keyboard navigation.
    function scrollHighlightIntoView(index: number) {
        if (index < 0) return
        nextTick(() => {
            tableWrapper.value?.querySelectorAll('tbody tr')[index]?.scrollIntoView({ block: 'nearest' })
        })
    }

    function crossPage(delta: number, edge: 'first' | 'last') {
        const target = page.page + delta
        if (target < 1 || target > lastPage()) return // already at the very first/last row
        pendingEdge.value = edge
        page.page = target
    }

    function move(delta: number) {
        const list = rows()
        if (!list.length) return
        if (highlightedIndex.value < 0) {
            highlightedIndex.value = delta > 0 ? 0 : list.length - 1
            return
        }
        const next = highlightedIndex.value + delta
        if (next < 0) return crossPage(-1, 'last')
        if (next > list.length - 1) return crossPage(1, 'first')
        highlightedIndex.value = next
    }

    function onKeydown(e: KeyboardEvent) {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                move(1)
                break
            case 'ArrowUp':
                e.preventDefault()
                move(-1)
                break
            case 'Escape':
                highlightedIndex.value = -1
                break
        }
    }

    return {
        highlightedIndex,
        tableWrapper,
        columnVisibility,
        columnMenuItems,
        tableMeta,
        toggleSort,
        sortIcon,
        sortableHeader,
        onKeydown,
        setHighlight: (i: number) => { highlightedIndex.value = i },
    }
}
