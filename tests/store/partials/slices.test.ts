import { describe, it, expect } from 'vitest'
import { reportSlice } from '@/store/widget/selection'

describe('reportSlice', () => {
    it('sortReports orders the list in place by the given key', () => {
        const { report, sortReports } = reportSlice()
        report.list = [
            { id: 'b', created_at: '2024-03-01' },
            { id: 'a', created_at: '2024-01-01' },
            { id: 'c', created_at: '2024-02-01' },
        ] as any

        sortReports('created_at')

        expect(report.list.map(r => r.id)).toEqual(['a', 'c', 'b'])
    })

    it('unloadReports clears the list and loaded flag', () => {
        const { report, unloadReports } = reportSlice()
        report.list = [{ id: 'x' }] as any
        report.loaded = true

        unloadReports()

        expect(report.list).toEqual([])
        expect(report.loaded).toBe(false)
    })
})
