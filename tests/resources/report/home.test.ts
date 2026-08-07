import { describe, expect, it } from 'vitest'
import { statusSegments, topAuthors } from '@/resources/report/home'

describe('statusSegments', () => {
    it('maps nonzero status counts to segments in lifecycle order with STATUS_META classes', () => {
        const segments = statusSegments({ resolved: 2, new: 3, done: 1, noticed: 0, progress: 0 })

        expect(segments.map((s) => s.status)).toEqual(['new', 'resolved', 'done'])
        expect(segments[0]).toMatchObject({ label: 'New', count: 3, barClass: 'bg-error', strokeClass: 'stroke-error' })
        expect(segments[1]).toMatchObject({ label: 'Resolved', count: 2, barClass: 'bg-success', strokeClass: 'stroke-success' })
        expect(segments[2]).toMatchObject({ label: 'Done', count: 1, barClass: 'bg-success/50', strokeClass: 'stroke-success/50' })
    })

    it('returns empty when every status count is zero or missing', () => {
        expect(statusSegments({})).toEqual([])
        expect(statusSegments({ new: 0, noticed: 0, progress: 0, resolved: 0, done: 0 })).toEqual([])
    })
})

describe('topAuthors', () => {
    const authors = [
        { id: 'a', name: 'Ada Lovelace' },
        { id: 'b', name: 'Grace Hopper' },
        { id: 'c', name: 'Alan Turing' },
    ]

    it('joins the count map with the author list and returns top-N contributors', () => {
        const top = topAuthors({ a: 5, b: 2, c: 9 }, authors, 3)

        expect(top).toEqual([
            { id: 'c', name: 'Alan Turing', reports_count: 9 },
            { id: 'a', name: 'Ada Lovelace', reports_count: 5 },
            { id: 'b', name: 'Grace Hopper', reports_count: 2 },
        ])
    })

    it('limits to n and drops authors with no counted reports', () => {
        const top = topAuthors({ a: 5, b: 0 }, authors, 2)

        expect(top).toEqual([{ id: 'a', name: 'Ada Lovelace', reports_count: 5 }])
        expect(topAuthors({}, authors, 3)).toEqual([])
    })

    it('ignores ids that are not in the author list', () => {
        const top = topAuthors({ a: 5, unknown: 99 }, authors, 3)

        expect(top).toEqual([{ id: 'a', name: 'Ada Lovelace', reports_count: 5 }])
    })
})
