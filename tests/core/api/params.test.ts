import { describe, expect, it } from 'vitest'
import { filterParams, includeArr, mergeParams, paginateParams, sortParams } from '@/core/api/params'

describe('filterParams', () => {
    it('builds a plain filter key without an operator', () => {
        expect(filterParams('status', 'unresolved')).toEqual({ 'filter[status]': 'unresolved' })
    })

    it('adds the :operator suffix when given', () => {
        expect(filterParams('body', 'text', 'like')).toEqual({ 'filter[body:like]': 'text' })
        expect(filterParams('author.name', 'Zig', 'like')).toEqual({ 'filter[author.name:like]': 'Zig' })
    })

    it('keeps the value as a plain string (single-value key)', () => {
        expect(filterParams('status', 'resolved')).toStrictEqual({ 'filter[status]': 'resolved' })
    })
})

describe('sortParams', () => {
    it('builds a sort key with the direction', () => {
        expect(sortParams('created_at', 'desc')).toEqual({ 'sort[created_at]': 'desc' })
        expect(sortParams('id', 'asc')).toEqual({ 'sort[id]': 'asc' })
    })
})

describe('paginateParams', () => {
    it('emits only the page key when perPage is omitted', () => {
        expect(paginateParams(1)).toEqual({ 'paginate[page]': '1' })
    })

    it('emits page + per_page as strings', () => {
        expect(paginateParams(2, 16)).toEqual({ 'paginate[page]': '2', 'paginate[per_page]': '16' })
    })
})

describe('includeArr', () => {
    it('returns the target list verbatim under the include[] key', () => {
        expect(includeArr(['pin', 'comments:count'])).toEqual({ 'include[]': ['pin', 'comments:count'] })
    })
})

describe('mergeParams', () => {
    it('merges disjoint keys from multiple bags', () => {
        expect(mergeParams({ a: '1' }, { b: '2' })).toEqual({ a: '1', b: '2' })
    })

    it('lets the last string value win for the same key', () => {
        expect(mergeParams({ status: 'open' }, { status: 'resolved' })).toEqual({ status: 'resolved' })
    })

    it('does not mutate any input bag', () => {
        const a = { 'filter[status]': 'open' }
        const b = { 'include[]': ['pin'] }
        const merged = mergeParams(a, b)
        expect(merged).toEqual({ 'filter[status]': 'open', 'include[]': ['pin'] })
        expect(a).toEqual({ 'filter[status]': 'open' })
        expect(b).toEqual({ 'include[]': ['pin'] })
    })

    it('PINS ACTUAL: an array value overwrites a string for the same key (no merge)', () => {
        // The docblock claims arrays merge; Object.assign overwrites instead.
        expect(mergeParams({ 'filter[status]': 'open' }, { 'include[]': ['pin'] })).toEqual({
            'filter[status]': 'open',
            'include[]': ['pin'],
        })
    })

    it('PINS ACTUAL: duplicate-key arrays do NOT concatenate across bags', () => {
        /**
         * Docblock: "If any bag has a string[] for that key, results are merged
         * into an array." Implementation: Object.assign - last bag wins entirely.
         */
        const merged = mergeParams({ 'include[]': ['pin', 'comments'] }, { 'include[]': ['screenshot'] })
        expect(merged['include[]']).toEqual(['screenshot'])
    })

    it('PINS ACTUAL: array + string leaves the LAST value only', () => {
        const merged = mergeParams({ 'include[]': ['pin'] }, { 'include[]': 'screenshot' })
        expect(merged['include[]']).toBe('screenshot')
    })

    it('keeps earlier arrays intact when later bags do not touch the key', () => {
        const merged = mergeParams({ 'include[]': ['pin'] }, { 'sort[id]': 'asc' })
        expect(merged['include[]']).toEqual(['pin'])
        expect(merged['sort[id]']).toBe('asc')
    })
})
