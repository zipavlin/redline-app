import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { useWidgetStore } from '@/store/widget'

const LIST_OK = (data: unknown[] = []) => ({ ok: true, status: 200, data: { data, meta: {} } })

function createRedline() {
    return {
        config: { features: [] },
        api: {
            auth: {
                me: vi.fn().mockRejectedValue(new Error('no session')),
                refresh: vi.fn(),
            },
            report: {
                list: vi.fn().mockResolvedValue(LIST_OK()),
                aggregate: vi.fn().mockResolvedValue({ ok: true, status: 200, data: {} }),
                show: vi.fn().mockResolvedValue({ ok: false, status: 404, data: null }),
                destroy: vi.fn().mockResolvedValue({ ok: false, status: 403, data: null }),
                status: vi.fn().mockResolvedValue({ ok: false, status: 403, data: null }),
            },
        },
    } as any
}

/** Mount the widget store the way production does: create the store within the app
 *  context so its inject('redline') resolves (cf. src/widget.ts). */
function mountWidgetStore(redline = createRedline()) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const app = createApp({ render: () => null })
    app.use(pinia)
    app.provide('redline', redline)
    const store = app.runWithContext(() => useWidgetStore())
    return { store, redline }
}

/** Override the (empty-by-default in happy-dom) scroll dimensions so pin math is deterministic. */
function setScrollSize(width: number, height: number) {
    Object.defineProperty(document.documentElement, 'scrollWidth', { value: width, configurable: true })
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: height, configurable: true })
}

function seedCachedUser(overrides: Record<string, string> = {}) {
    localStorage.setItem('redline_name', 'Ada')
    localStorage.setItem('redline_email', 'ada@example.com')
    localStorage.setItem('redline_role', 'developer')
    for (const [k, v] of Object.entries(overrides)) localStorage.setItem(k, v)
}

describe('useWidgetStore', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        document.body.innerHTML = ''
        window.history.replaceState(null, '', '/')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        delete (document.documentElement as any).scrollWidth
        delete (document.documentElement as any).scrollHeight
    })

    it('initializes with default widget state', () => {
        const { store } = mountWidgetStore()

        expect(store.filter.type).toBeNull()
        expect(store.mode).toBeNull()
        expect(store.capturing).toBe(false)
        expect(store.unresolvedCount).toBe(0)
        expect(store.capabilities.capture).toBe(false)
        expect(store.report.loaded).toBe(false)
        expect(store.report.list).toEqual([])
        expect(store.report.active).toBeNull()
        expect(store.report.activeEl).toBeNull()
    })

    // Load reports.

    it('loads reports and decorates them with page-pixel pin coordinates', async () => {
        setScrollSize(800, 600)
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([
            { id: '1', status: 'new', created_at: '2024-01-01', pin: { x: 50, y: 25 } },
            { id: '2', status: 'done', created_at: '2024-01-02', pin: null },
        ]))
        const { store } = mountWidgetStore(redline)

        await store.loadReports()

        expect(store.report.loaded).toBe(true)
        expect(store.report.list[0]).toEqual(expect.objectContaining({ id: '1', _pageX: 400, _pageY: 150 }))
        // Reports without a pin stay undecorated.
        expect(store.report.list[1]).not.toHaveProperty('_pageX')
        expect(store.report.list[1]).not.toHaveProperty('_pageY')
    })

    it('records the location and status filter and sends them to the API', async () => {
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([]))
        const { store } = mountWidgetStore(redline)

        await store.loadReports('unresolved')

        expect(store.filter.type).toBe('unresolved')
        expect(store.filter.url).toBe('/')
        expect(redline.api.report.list).toHaveBeenCalledWith(expect.objectContaining({
            'filter[location]': '/',
            'filter[status]': 'unresolved',
        }))

        // 'all' (and null) omit the status filter entirely.
        redline.api.report.list.mockClear()
        await store.loadReports('all')
        const allParams = redline.api.report.list.mock.calls[0][0] as Record<string, unknown>
        expect(allParams).not.toHaveProperty('filter[status]')
    })

    it('leaves the list untouched when the list request fails', async () => {
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue({ ok: false, status: 500, data: null })
        const { store } = mountWidgetStore(redline)

        await store.loadReports('new')

        expect(store.report.loaded).toBe(false)
        expect(store.report.list).toEqual([])
        // The requested type is still recorded even when the load fails.
        expect(store.filter.type).toBe('new')
    })

    it('leaves the list untouched when the list request rejects', async () => {
        const redline = createRedline()
        redline.api.report.list.mockRejectedValue(new Error('network down'))
        const { store } = mountWidgetStore(redline)

        await expect(store.loadReports()).resolves.toBeUndefined()

        expect(store.report.loaded).toBe(false)
        expect(store.report.list).toEqual([])
    })

    // Open report.

    it('sets active immediately from the initial data before the detail arrives', async () => {
        const redline = createRedline()
        let resolveShow: (value: any) => void = () => {}
        redline.api.report.show.mockReturnValue(new Promise(r => { resolveShow = r }))
        const { store } = mountWidgetStore(redline)

        const pending = store.openReport({ id: '1', status: 'new', pin: null, title: 't' })

        expect(store.report.active).toEqual(expect.objectContaining({ id: '1', title: 't' }))

        resolveShow({ ok: true, status: 200, data: { id: '1', status: 'new', body: 'detail', pin: null } })
        await pending
        expect(store.report.active?.body).toBe('detail')
    })

    it('merges detail into the active report and the matching list row', async () => {
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([
            { id: '1', status: 'new', created_at: '2024-01-01', pin: null, title: 'list title' },
        ]))
        redline.api.report.show.mockResolvedValue({
            ok: true, status: 200,
            data: { id: '1', status: 'progress', body: 'detail body', pin: null, title: 'detail title' },
        })
        const { store } = mountWidgetStore(redline)
        await store.loadReports()

        await store.openReport({ id: '1', status: 'new', created_at: '2024-01-01', pin: null })

        expect(redline.api.report.show).toHaveBeenCalledWith('1', expect.objectContaining({
            'include[]': expect.arrayContaining(['pin', 'element', 'title', 'body', 'browser', 'comments', 'location', 'url']),
        }))
        expect(store.report.active).toEqual(expect.objectContaining({ id: '1', body: 'detail body', status: 'progress', title: 'detail title' }))
        expect(store.report.list[0]).toEqual(expect.objectContaining({ body: 'detail body', status: 'progress' }))
    })

    it('ignores a stale detail response when the active report changed mid-flight', async () => {
        const redline = createRedline()
        let resolveShow1: (value: any) => void = () => {}
        redline.api.report.show.mockImplementation((id: string) => {
            if (id === '1') return new Promise(r => { resolveShow1 = r })
            return Promise.resolve({ ok: true, status: 200, data: { id: '2', status: 'new', body: 'second', pin: null } })
        })
        const { store } = mountWidgetStore(redline)

        const first = store.openReport({ id: '1', status: 'new', pin: null, title: 'first' })
        const second = store.openReport({ id: '2', status: 'new', pin: null, title: 'second' })
        await second
        expect(store.report.active?.id).toBe('2')

        resolveShow1({ ok: true, status: 200, data: { id: '1', status: 'progress', body: 'first detail', pin: null } })
        await first

        expect(store.report.active?.id).toBe('2')
        expect(store.report.active).not.toHaveProperty('body', 'first detail')
    })

    it('keeps the initial data when the detail request fails', async () => {
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({ ok: false, status: 500, data: null })
        const { store } = mountWidgetStore(redline)

        await store.openReport({ id: '1', status: 'new', pin: null, title: 't' })

        expect(store.report.active).toEqual(expect.objectContaining({ id: '1', status: 'new', title: 't' }))
        expect(store.report.active?.body).toBeUndefined()
    })

    it('resolves a prefer_selector element to a DOM node and preserves it after the merge', async () => {
        document.body.innerHTML = '<div id="pin-target"></div>'
        const targetEl = document.querySelector('#pin-target')!
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({
            ok: true, status: 200,
            data: { id: '1', status: 'new', body: 'detail body', pin: { x: 10, y: 10 }, element: '#some-other' },
        })
        const { store } = mountWidgetStore(redline)

        await store.openReport({
            id: '1', status: 'new', pin: { x: 10, y: 10, prefer_selector: true }, element: '#pin-target',
        })

        expect(store.report.active?.element).toBe(targetEl)
        expect(store.report.active?.element).not.toBe('#some-other')
        expect(store.report.active?.body).toBe('detail body')
    })

    it('falls back to null when the prefer_selector element is not in the DOM', async () => {
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({ ok: true, status: 200, data: { id: '1', status: 'new', pin: null } })
        const { store } = mountWidgetStore(redline)

        await store.openReport({ id: '1', status: 'new', pin: { x: 5, y: 5, prefer_selector: true }, element: '#nope' })

        expect(store.report.active?.element).toBeNull()
    })

    // Focus report.

    it('fetches and appends a missing report, scrolls to its pin, and opens it', async () => {
        setScrollSize(800, 600)
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({
            ok: true, status: 200,
            data: { id: '42', status: 'new', created_at: '2024-01-01', pin: { x: 50, y: 50 } },
        })
        const { store } = mountWidgetStore(redline)

        await store.focusReport('42')

        // Fetch path: show called for the detail fetch (plus once more via openReport).
        expect(redline.api.report.show).toHaveBeenCalledWith('42', expect.objectContaining({
            'include[]': expect.arrayContaining(['pin', 'element', 'title', 'body', 'browser', 'comments', 'location', 'url']),
        }))
        expect(store.report.list.map(r => r.id)).toEqual(['42'])
        expect(store.report.active?.id).toBe('42')
        expect(scrollTo).toHaveBeenCalledWith({ top: 300 - window.innerHeight / 2, behavior: 'smooth' })
    })

    it('reuses the loaded list item without fetching when already present', async () => {
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({
            ok: true, status: 200,
            data: { id: '42', status: 'new', body: 'detail', pin: { x: 10, y: 10 } },
        })
        const { store } = mountWidgetStore(redline)
        store.report.list = [{ id: '42', status: 'new', pin: { x: 10, y: 10 }, _pageY: 500 }] as any

        await store.focusReport('42')

        // Only openReport's own detail call - no pre-fetch.
        expect(redline.api.report.show).toHaveBeenCalledTimes(1)
        expect(scrollTo).toHaveBeenCalledWith({ top: 500 - window.innerHeight / 2, behavior: 'smooth' })
        expect(store.report.list).toHaveLength(1)
    })

    it('does nothing when fetching a missing report fails', async () => {
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({ ok: false, status: 404, data: null })
        const { store } = mountWidgetStore(redline)

        await store.focusReport('42')

        expect(store.report.list).toEqual([])
        expect(store.report.active).toBeNull()
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does not scroll when the report has no pin, but still opens it', async () => {
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({ ok: true, status: 200, data: { id: '42', status: 'new', pin: null } })
        const { store } = mountWidgetStore(redline)
        store.report.list = [{ id: '42', status: 'new', pin: null }] as any

        await store.focusReport('42')

        expect(scrollTo).not.toHaveBeenCalled()
        expect(store.report.active?.id).toBe('42')
    })

    it('passes the matching DOM pin element as activeEl', async () => {
        document.body.innerHTML = '<div data-report-id="42"></div>'
        const pinEl = document.querySelector('[data-report-id="42"]')!
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({ ok: true, status: 200, data: { id: '42', status: 'new', pin: null } })
        const { store } = mountWidgetStore(redline)
        store.report.list = [{ id: '42', status: 'new', pin: null }] as any

        await store.focusReport('42')

        expect(store.report.activeEl).toBe(pinEl)
    })

    // Delete report.

    it('removes the deleted report from the list and clears active when it is active', async () => {
        const redline = createRedline()
        redline.api.report.destroy.mockResolvedValue({ ok: true, status: 200, data: null })
        const { store } = mountWidgetStore(redline)
        store.report.list = [
            { id: '1', status: 'new', pin: null },
            { id: '2', status: 'done', pin: null },
        ] as any
        store.report.active = { id: '1', status: 'new', pin: null } as any
        store.report.activeEl = {} as HTMLElement

        const ok = await store.deleteReport('1')

        expect(ok).toBe(true)
        expect(redline.api.report.destroy).toHaveBeenCalledWith('1')
        expect(store.report.active).toBeNull()
        expect(store.report.activeEl).toBeNull()
        expect(store.report.list.map(r => r.id)).toEqual(['2'])
    })

    it('keeps the active report when deleting a different one', async () => {
        const redline = createRedline()
        redline.api.report.destroy.mockResolvedValue({ ok: true, status: 200, data: null })
        const { store } = mountWidgetStore(redline)
        store.report.list = [
            { id: '1', status: 'new', pin: null },
            { id: '2', status: 'done', pin: null },
        ] as any
        store.report.active = { id: '1', status: 'new', pin: null } as any

        await store.deleteReport('2')

        expect(store.report.active?.id).toBe('1')
        expect(store.report.list.map(r => r.id)).toEqual(['1'])
    })

    it('returns false and mutates nothing when destroy fails', async () => {
        const redline = createRedline()
        redline.api.report.destroy.mockResolvedValue({ ok: false, status: 403, data: null })
        const { store } = mountWidgetStore(redline)
        store.report.list = [{ id: '1', status: 'new', pin: null }] as any
        store.report.active = { id: '1', status: 'new', pin: null } as any

        const ok = await store.deleteReport('1')

        expect(ok).toBe(false)
        expect(store.report.active?.id).toBe('1')
        expect(store.report.list).toHaveLength(1)
    })

    // Change status.

    it('merges the new status into the active report and the list row on success', async () => {
        const redline = createRedline()
        redline.api.report.status.mockResolvedValue({ ok: true, status: 200, data: { id: '1', status: 'resolved' } })
        const { store } = mountWidgetStore(redline)
        store.report.list = [{ id: '1', status: 'new', pin: null }] as any
        store.report.active = { id: '1', status: 'new', pin: null } as any

        const ok = await store.changeStatus('1', 'resolved')

        expect(ok).toBe(true)
        expect(redline.api.report.status).toHaveBeenCalledWith('1', 'resolved')
        expect(store.report.active?.status).toBe('resolved')
        expect(store.report.list[0].status).toBe('resolved')
    })

    it('updates only the list row when the status change targets a non-active report', async () => {
        const redline = createRedline()
        redline.api.report.status.mockResolvedValue({ ok: true, status: 200, data: { id: '2', status: 'done' } })
        const { store } = mountWidgetStore(redline)
        store.report.list = [
            { id: '1', status: 'new', pin: null },
            { id: '2', status: 'new', pin: null },
        ] as any
        store.report.active = { id: '1', status: 'new', pin: null } as any

        await store.changeStatus('2', 'done')

        expect(store.report.active?.status).toBe('new')
        expect(store.report.list[1].status).toBe('done')
    })

    it('returns false and mutates nothing when the status request fails', async () => {
        const redline = createRedline()
        redline.api.report.status.mockResolvedValue({ ok: false, status: 403, data: null })
        const { store } = mountWidgetStore(redline)
        store.report.list = [{ id: '1', status: 'new', pin: null }] as any
        store.report.active = { id: '1', status: 'new', pin: null } as any

        const ok = await store.changeStatus('1', 'resolved')

        expect(ok).toBe(false)
        expect(store.report.active?.status).toBe('new')
        expect(store.report.list[0].status).toBe('new')
    })

    // URL deep-link sync (watchers + _syncUrlParam).

    it('writes the active report id into redline-report and removes it on close', async () => {
        const redline = createRedline()
        redline.api.report.show.mockResolvedValue({ ok: true, status: 200, data: { id: '1', status: 'new', pin: null } })
        const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
        const { store } = mountWidgetStore(redline)

        await store.openReport({ id: '1', status: 'new', pin: null })
        await nextTick()

        expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.stringContaining('redline-report=1'))

        store.closeReport()
        await nextTick()

        const lastUrl = (replaceState.mock.calls.at(-1)![2] as string)
        expect(lastUrl).not.toContain('redline-report')
    })

    it('writes a valid filter type into redline-filter and removes it on unload', async () => {
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([]))
        const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
        const { store } = mountWidgetStore(redline)

        await store.loadReports('unresolved')
        await nextTick()

        expect(replaceState).toHaveBeenLastCalledWith(null, '', expect.stringContaining('redline-filter=unresolved'))

        store.unloadReports()
        await nextTick()

        const lastUrl = (replaceState.mock.calls.at(-1)![2] as string)
        expect(lastUrl).not.toContain('redline-filter')
    })

    it('drops the redline-filter param for types outside the URL allowlist', async () => {
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([]))
        const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
        const { store } = mountWidgetStore(redline)

        await store.loadReports('bogus-type')
        await nextTick()

        const lastUrl = (replaceState.mock.calls.at(-1)![2] as string)
        expect(lastUrl).not.toContain('redline-filter')
    })

    it('loads unresolved reports when expanded with a user and unloads when collapsed', async () => {
        seedCachedUser()
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([{ id: '1', status: 'new', pin: null }]))
        const { store } = mountWidgetStore(redline)

        // No URL params and collapsed at start → nothing auto-loaded.
        expect(redline.api.report.list).not.toHaveBeenCalled()

        store.settings.expanded = true
        await vi.waitFor(() => {
            expect(redline.api.report.list).toHaveBeenCalledWith(expect.objectContaining({ 'filter[status]': 'unresolved' }))
        })

        store.settings.expanded = false
        await vi.waitFor(() => expect(store.report.loaded).toBe(false))
        expect(store.report.list).toEqual([])
    })

    it('handles redline-filter / redline-report deep links once on session start', async () => {
        seedCachedUser()
        window.history.replaceState(null, '', '/page?redline-filter=unresolved&redline-report=99')
        const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([{ id: '99', status: 'new', pin: null }]))
        redline.api.report.show.mockResolvedValue({
            ok: true, status: 200,
            data: { id: '99', status: 'new', body: 'deep-linked', pin: null },
        })
        redline.api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: { unresolved: 5, resolved: 1 } } })
        const { store } = mountWidgetStore(redline)

        await vi.waitFor(() => {
            expect(redline.api.report.list).toHaveBeenCalledWith(expect.objectContaining({
                'filter[location]': '/page',
                'filter[status]': 'unresolved',
            }))
        })
        await vi.waitFor(() => expect(store.report.active?.id).toBe('99'))

        expect(store.report.active?.body).toBe('deep-linked')
        expect(store.report.loaded).toBe(true)
        expect(redline.api.report.aggregate).toHaveBeenCalledWith({
            'aggregate[status:count]': 'unresolved,resolved',
            'filter[location]': '/page',
        })
        await vi.waitFor(() => expect(store.unresolvedCount).toBe(5))
        // The sync watcher also wrote the active id back into the URL.
        expect(replaceState).toHaveBeenCalledWith(null, '', expect.stringContaining('redline-report=99'))
    })

    it('does not re-handle deep-link params after the initial session handling', async () => {
        seedCachedUser()
        window.history.replaceState(null, '', '/page?redline-filter=unresolved')
        const redline = createRedline()
        redline.api.report.list.mockResolvedValue(LIST_OK([]))
        const { store } = mountWidgetStore(redline)

        await vi.waitFor(() => expect(redline.api.report.list).toHaveBeenCalled())
        const listCalls = redline.api.report.list.mock.calls.length

        store.activateSession({ id: 'u2', name: 'Bob', email: 'bob@example.com', role: 'reporter' })
        await nextTick()

        expect(redline.api.report.list.mock.calls.length).toBe(listCalls)
    })

    it('re-fires the unresolved count when the user identity changes', async () => {
        seedCachedUser({ redline_id: 'u1' })
        const redline = createRedline()
        const { store } = mountWidgetStore(redline)

        await vi.waitFor(() => expect(redline.api.report.aggregate).toHaveBeenCalledTimes(1))

        store.activateSession({ id: 'u2', name: 'Bob', email: 'bob@example.com', role: 'reporter' })
        await vi.waitFor(() => expect(redline.api.report.aggregate).toHaveBeenCalledTimes(2))
    })

    // Refresh unresolved count.

    it('updates unresolvedCount from the aggregate response', async () => {
        const redline = createRedline()
        redline.api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data: { status: { unresolved: 7, resolved: 3 } } })
        const { store } = mountWidgetStore(redline)

        await store.refreshUnresolvedCount()

        expect(redline.api.report.aggregate).toHaveBeenCalledWith({
            'aggregate[status:count]': 'unresolved,resolved',
            'filter[location]': '/',
        })
        expect(store.unresolvedCount).toBe(7)
    })

    it('keeps the previous count when the aggregate response is malformed', async () => {
        const redline = createRedline()
        // OK but the status breakdown is missing.
        redline.api.report.aggregate.mockResolvedValue({ ok: true, status: 200, data: { other: 1 } })
        const { store } = mountWidgetStore(redline)
        store.unresolvedCount = 3

        await store.refreshUnresolvedCount()
        expect(store.unresolvedCount).toBe(3)
    })

    it('keeps the previous count when the aggregate request rejects', async () => {
        const redline = createRedline()
        redline.api.report.aggregate.mockRejectedValue(new Error('network down'))
        const { store } = mountWidgetStore(redline)
        store.unresolvedCount = 3

        await expect(store.refreshUnresolvedCount()).resolves.toBeUndefined()
        expect(store.unresolvedCount).toBe(3)
    })
})
