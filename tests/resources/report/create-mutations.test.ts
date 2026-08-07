import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reportKeys } from '@/resources/report/keys'
import { useCreateReport, useReportStatusMutation } from '@/resources/report/mutations'
import { mountResource, restoreScrollDimensions, unmountResources } from '../support/harness'

/**
 * The selector helpers read the live DOM; mock them so the verified/unverified
 * pin branches are controllable without depending on selector resolution details.
 */
const selectorMocks = vi.hoisted(() => ({
    getCssSelector: vi.fn(),
    resolveSelector: vi.fn(),
}))

vi.mock('@/core/selector', () => selectorMocks)

function makeApi() {
    return {
        report: { store: vi.fn(), status: vi.fn() },
        screenshot: { store: vi.fn() },
        video: { store: vi.fn() },
    }
}

const savedReport = { id: 'r1', status: 'new', created_at: '2026-01-01T00:00:00Z' }
const okStore = () => ({ ok: true, status: 200, data: savedReport })

function mountCreate() {
    return mountResource((api) => ({ create: useCreateReport() }), makeApi)
}

afterEach(() => {
    unmountResources()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    window.history.pushState({}, '', '/')
    restoreScrollDimensions()
})

describe('useCreateReport', () => {
    it('posts url/location/body/browser to report store', async () => {
        window.history.pushState({}, '', '/issues/42?ref=home')
        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        const saved = await result.create.mutateAsync({ body: '<p>hi</p>' })
        await flushPromises()

        expect(api.report.store).toHaveBeenCalledTimes(1)
        const payload = api.report.store.mock.calls[0][0] as Record<string, unknown>
        expect(payload).toMatchObject({
            url: `${location.origin}/issues/42?ref=home`,
            location: '/issues/42?ref=home',
            body: '<p>hi</p>',
        })
        expect(payload.browser).toMatchObject({
            name: expect.any(String),
            os: expect.any(String),
            viewport_width: expect.any(Number),
            viewport_height: expect.any(Number),
        })
        expect(saved).toEqual(savedReport)
    })

    it('passes the pin through untouched when there is no element', async () => {
        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        const pin = { x: 12.5, y: 80, scroll_x: 0, scroll_y: 120 }
        await result.create.mutateAsync({ body: 'x', pin })
        await flushPromises()

        const payload = api.report.store.mock.calls[0][0] as Record<string, unknown>
        expect(payload.pin).toEqual(pin)
        expect(payload.element).toBeUndefined()
    })

    it('sends the element selector with prefer_selector:true when the selector verifies', async () => {
        const el = document.createElement('div')
        el.id = 'target'
        selectorMocks.getCssSelector.mockReturnValue('div#target')
        selectorMocks.resolveSelector.mockReturnValue(el)

        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        await result.create.mutateAsync({ body: 'x', element: el, pin: { x: 10, y: 20 } })
        await flushPromises()

        const payload = api.report.store.mock.calls[0][0] as Record<string, unknown>
        expect(payload.element).toBe('div#target')
        expect(payload.pin).toEqual({ x: 10, y: 20, prefer_selector: true })
    })

    it('recomputes the pin to page coordinates with prefer_selector:false when the selector cannot be verified', async () => {
        const el = document.createElement('div')
        el.id = 'target'
        selectorMocks.getCssSelector.mockReturnValue('div#target')
        selectorMocks.resolveSelector.mockReturnValue(null) // Selector does not resolve back

        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, x: 10, y: 20, toJSON: () => ({}),
        })
        Object.defineProperty(document.documentElement, 'scrollWidth', { value: 1000, configurable: true })
        Object.defineProperty(document.documentElement, 'scrollHeight', { value: 800, configurable: true })

        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        await result.create.mutateAsync({ body: 'x', element: el, pin: { x: 10, y: 20 } })
        await flushPromises()

        const payload = api.report.store.mock.calls[0][0] as Record<string, unknown>
        /**
         * PageX = 10 + 10% * 200 + scrollX(0) = 30 → x = 30/1000*100 = 3
         * PageY = 20 + 20% * 100 + scrollY(0) = 40 → y = 40/800*100 = 5
         */
        expect(payload.pin).toEqual({ x: 3, y: 5, prefer_selector: false })
        expect(payload.element).toBeUndefined()
    })

    it('does not attach a selector when the element has no pin', async () => {
        const el = document.createElement('div')
        selectorMocks.getCssSelector.mockReturnValue('div#target')
        selectorMocks.resolveSelector.mockReturnValue(el)

        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        await result.create.mutateAsync({ body: 'x', element: el })
        await flushPromises()

        const payload = api.report.store.mock.calls[0][0] as Record<string, unknown>
        expect(payload.element).toBeUndefined()
        expect(payload.pin).toBeUndefined()
    })

    it('rejects with the failed response when report store fails', async () => {
        const { api, result } = mountCreate()
        const bad = { ok: false, status: 422, data: null }
        api.report.store.mockResolvedValue(bad)
        await expect(result.create.mutateAsync({ body: 'x' })).rejects.toMatchObject({
            message: 'Report store failed',
            response: bad,
        })
    })

    it('keeps the mutation successful when a screenshot upload returns an error (best-effort)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        api.screenshot.store.mockResolvedValue({ ok: false, status: 500, data: null })

        const saved = await result.create.mutateAsync({ body: 'x', screenshot: new Blob(['x'], { type: 'image/png' }) })
        await flushPromises()

        expect(saved).toEqual(savedReport)
        expect(api.screenshot.store).toHaveBeenCalledWith('r1', expect.any(Blob))
        expect(warn).toHaveBeenCalledWith('[redline] screenshot upload failed', { status: 500 })
    })

    it('keeps the mutation successful when a screenshot upload throws (best-effort)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        api.screenshot.store.mockRejectedValue(new Error('network down'))

        const saved = await result.create.mutateAsync({ body: 'x', screenshot: new Blob(['x'], { type: 'image/png' }) })
        await flushPromises()

        expect(saved).toEqual(savedReport)
        expect(warn).toHaveBeenCalledWith('[redline] screenshot upload threw', expect.any(Error))
    })

    it('rejects the mutation when a video upload returns an error', async () => {
        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        const bad = { ok: false, status: 500, data: null }
        api.video.store.mockResolvedValue(bad)

        await expect(result.create.mutateAsync({ body: 'x', video: new Blob(['x'], { type: 'video/webm' }) })).rejects.toMatchObject({
            message: 'Video upload failed (HTTP 500)',
            response: bad,
        })
    })

    it('propagates a thrown video upload error', async () => {
        const { api, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        api.video.store.mockRejectedValue(new Error('boom'))

        await expect(result.create.mutateAsync({ body: 'x', video: new Blob(['x'], { type: 'video/webm' }) })).rejects.toThrow('boom')
    })

    it('invalidates report lists and aggregates on success', async () => {
        const { api, queryClient, result } = mountCreate()
        api.report.store.mockResolvedValue(okStore())
        queryClient.setQueryData(reportKeys.lists(), {})
        queryClient.setQueryData(reportKeys.aggregates(), {})
        await result.create.mutateAsync({ body: 'x' })
        await flushPromises()

        expect(queryClient.getQueryState(reportKeys.lists())?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.aggregates())?.isInvalidated).toBe(true)
    })
})

describe('useReportStatusMutation', () => {
    it('PATCHes report/{id}/status with the status and invalidates lists, detail and aggregates', async () => {
        const { api, queryClient, result } = mountResource((api) => ({ status: useReportStatusMutation() }), makeApi)
        api.report.status.mockResolvedValue({ ok: true, status: 200, data: { ...savedReport, status: 'resolved' } })
        queryClient.setQueryData(reportKeys.lists(), {})
        queryClient.setQueryData(reportKeys.detail('r1'), { id: 'r1' })
        queryClient.setQueryData(reportKeys.aggregates(), {})

        const updated = await result.status.mutateAsync({ id: 'r1', status: 'resolved' })
        await flushPromises()

        expect(api.report.status).toHaveBeenCalledWith('r1', 'resolved')
        expect(updated.status).toBe('resolved')
        expect(queryClient.getQueryState(reportKeys.lists())?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.detail('r1'))?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.aggregates())?.isInvalidated).toBe(true)
    })

    it('throws "Failed to change status" when the response is not ok', async () => {
        const { api, result } = mountResource((api) => ({ status: useReportStatusMutation() }), makeApi)
        api.report.status.mockResolvedValue({ ok: false, status: 500, data: null })
        await expect(result.status.mutateAsync({ id: 'r1', status: 'resolved' })).rejects.toThrow('Failed to change status')
    })
})
