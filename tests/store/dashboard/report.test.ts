import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportSlice } from '@/store/dashboard/report'

function createMockRedline() {
    return {
        api: {
            report: {
                show: vi.fn().mockResolvedValue({ ok: true, data: { id: '1', status: 'new', body: 'Test', created_at: '2024-01-01' } }),
            },
        },
        config: { features: [] },
    } as any
}

describe('reportSlice', () => {
    let redline: ReturnType<typeof createMockRedline>

    beforeEach(() => {
        redline = createMockRedline()
    })

    it('initializes with default filter state', () => {
        const { report } = reportSlice(redline)

        expect(report.filter.statusGroup).toBe('all')
        expect(report.filter.search).toBe('')
        expect(report.filter.mine).toBe(false)
        expect(report.sort).toBe('created_at')
        expect(report.dir).toBe('desc')
        expect(report.page.page).toBe(1)
        expect(report.page.perPage).toBe(15)
    })

    it('builds list params with pagination and sort', () => {
        const { reportListParams } = reportSlice(redline)
        const params = reportListParams()

        expect(params['paginate[page]']).toBe('1')
        expect(params['paginate[per_page]']).toBe('15')
        expect(params['sort[created_at]']).toBe('desc')
    })

    it('includes status filter when not "all"', () => {
        const { report, reportListParams } = reportSlice(redline)
        report.filter.statusGroup = 'unresolved'
        const params = reportListParams()

        expect(params['filter[status]']).toBe('unresolved')
    })

    it('includes search filter with like operator', () => {
        const { report, reportListParams } = reportSlice(redline)
        report.filter.search = 'bug'
        const params = reportListParams()

        expect(params['filter[body:like]']).toBe('bug')
    })

    it('includes mine filter', () => {
        const { report, reportListParams } = reportSlice(redline)
        report.filter.mine = true
        const params = reportListParams()

        expect(params['filter[mine]']).toBe('1')
    })

    it('includes date range filters', () => {
        const { report, reportListParams } = reportSlice(redline)
        report.filter.dateFrom = '2024-01-01'
        report.filter.dateTo = '2024-12-31'
        const params = reportListParams()

        expect(params['filter[created_at:from]']).toBe('2024-01-01')
        expect(params['filter[created_at:to]']).toBe('2024-12-31')
    })

    it('includes author filter', () => {
        const { report, reportListParams } = reportSlice(redline)
        report.filter.userId = 'user-123'
        const params = reportListParams()

        expect(params['filter[author]']).toBe('user-123')
    })

    it('includes existence filters', () => {
        const { report, reportListParams } = reportSlice(redline)
        report.filter.hasMedia = true
        report.filter.hasComments = true
        const params = reportListParams()

        expect(params['filter[screenshot:exists]']).toBe('1')
        expect(params['filter[comments:exists]']).toBe('1')
    })

    it('includes location filter', () => {
        const { report, reportListParams } = reportSlice(redline)
        report.filter.location = '/dashboard'
        const params = reportListParams()

        expect(params['filter[location]']).toBe('/dashboard')
    })

    it('openReport loads report detail and sets active', async () => {
        const { report, openReport } = reportSlice(redline)
        await openReport('1')

        expect(redline.api.report.show).toHaveBeenCalledWith('1', expect.any(Object))
        expect(report.active).toEqual(expect.objectContaining({ id: '1' }))
    })

    it('closeReport clears active report', async () => {
        const { report, openReport, closeReport } = reportSlice(redline)
        await openReport('1')
        expect(report.active).not.toBeNull()

        closeReport()
        expect(report.active).toBeNull()
    })
})
