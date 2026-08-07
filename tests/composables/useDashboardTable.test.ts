import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, reactive, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useDashboardTable, type TableSortDir } from '@/composables/useDashboardTable'

interface Row { id: string }

function setupHarness(overrides: { active?: () => unknown } = {}) {
    const rows = ref<Row[]>([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const page = reactive({ page: 1 })
    const sort = reactive({ sort: 'name', dir: 'asc' as TableSortDir })
    const filterSignal = ref(0)
    const select = vi.fn()
    const clear = vi.fn()

    const Harness = defineComponent({
        setup() {
            const table = useDashboardTable<Row>({
                rows: () => rows.value,
                lastPage: () => 2,
                page,
                sort,
                resetSource: () => [filterSignal.value],
                select,
                clear,
                ...(overrides.active ? { active: overrides.active } : {}),
                toggleableColumns: [{ id: 'name', label: 'Name' }],
            })
            return { table, rows, page, sort, filterSignal, select, clear }
        },
        template: '<div />',
    })

    const wrapper = mount(Harness)
    return { wrapper, rows, page, sort, filterSignal, select, clear }
}

type TableApi = ReturnType<typeof useDashboardTable<Row>>

function tableOf(wrapper: VueWrapper): TableApi {
    return (wrapper.vm as unknown as { table: TableApi }).table
}

function key(key: string): KeyboardEvent {
    return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

describe('useDashboardTable', () => {
    let h: ReturnType<typeof setupHarness>
    let t: TableApi

    beforeEach(() => {
        h = setupHarness()
        t = tableOf(h.wrapper)
    })

    it('starts with no selection', () => {
        expect(t.highlightedIndex.value).toBe(-1)
    })

    it('ArrowDown selects the first row and reports it via the select callback', async () => {
        t.onKeydown(key('ArrowDown'))
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(0)
        expect(h.select).toHaveBeenCalledWith({ id: 'a' })
    })

    it('ArrowDown/ArrowUp walk the rows and clamp at the page edges', async () => {
        t.onKeydown(key('ArrowDown'))
        t.onKeydown(key('ArrowDown'))
        t.onKeydown(key('ArrowDown'))
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(2)

        t.onKeydown(key('ArrowUp'))
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(1)

        // ArrowUp past the first row is a no-op (already on page 1).
        t.onKeydown(key('ArrowUp'))
        t.onKeydown(key('ArrowUp'))
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(0)
    })

    it('Escape clears the selection and calls clear()', async () => {
        t.onKeydown(key('ArrowDown'))
        await h.wrapper.vm.$nextTick()
        t.onKeydown(key('Escape'))
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(-1)
        expect(h.clear).toHaveBeenCalled()
    })

    it('ArrowDown past the last row crosses to the next page and lands on the first row', async () => {
        for (let i = 0; i < 4; i++) t.onKeydown(key('ArrowDown'))
        expect(h.page.page).toBe(2)

        // New page's rows land: the pending edge intent is applied.
        h.rows.value = [{ id: 'x' }]
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(0)
    })

    it('clamps the highlight when the row list shrinks', async () => {
        for (let i = 0; i < 2; i++) t.onKeydown(key('ArrowDown'))
        expect(t.highlightedIndex.value).toBe(1)
        h.rows.value = [{ id: 'a' }]
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(0)
    })

    it('a manual page jump drops the selection', async () => {
        t.onKeydown(key('ArrowDown'))
        await h.wrapper.vm.$nextTick()
        h.page.page = 2
        await h.wrapper.vm.$nextTick()
        expect(t.highlightedIndex.value).toBe(-1)
    })

    it('filter change resets to page 1 and drops the selection', async () => {
        h.page.page = 2
        t.onKeydown(key('ArrowDown'))
        await h.wrapper.vm.$nextTick()
        h.filterSignal.value++
        await h.wrapper.vm.$nextTick()
        expect(h.page.page).toBe(1)
        expect(t.highlightedIndex.value).toBe(-1)
    })

    it('toggleSort flips direction for the same key and starts desc for a new key', () => {
        t.toggleSort('name')
        expect(h.sort.dir).toBe('desc')
        t.toggleSort('name')
        expect(h.sort.dir).toBe('asc')
        t.toggleSort('role')
        expect(h.sort.sort).toBe('role')
        expect(h.sort.dir).toBe('desc')
    })

    it('sortIcon reflects the active column and direction', () => {
        expect(t.sortIcon('name')).toBe('i-lucide-arrow-up-narrow-wide')
        expect(t.sortIcon('role')).toBe('i-lucide-arrow-up-down')
        t.toggleSort('name')
        expect(t.sortIcon('name')).toBe('i-lucide-arrow-down-wide-narrow')
    })

    it('column menu items toggle visibility checkboxes', async () => {
        const items = t.columnMenuItems.value[0]
        expect(items[0].checked).toBe(true)
        items[0].onUpdateChecked?.(false)
        expect(t.columnVisibility.value.name).toBe(false)
        expect(t.columnMenuItems.value[0][0].checked).toBe(false)
    })

    it('external close clears the highlight when active becomes null', async () => {
        const active = ref<unknown>({ id: 'a' })
        const harness = setupHarness({ active: () => active.value })
        const other = tableOf(harness.wrapper)
        other.onKeydown(key('ArrowDown'))
        await harness.wrapper.vm.$nextTick()
        expect(other.highlightedIndex.value).toBe(0)
        active.value = null
        await harness.wrapper.vm.$nextTick()
        expect(other.highlightedIndex.value).toBe(-1)
    })
})
