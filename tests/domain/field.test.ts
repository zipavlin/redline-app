import { describe, expect, it } from 'vitest'
import { FIELD_TYPES } from '@/domain/field'
import type { FieldType } from '@/domain/field'

describe('FIELD_TYPES', () => {
    it('exposes the four supported field types in order (mirrors the backend FieldType enum)', () => {
        expect(FIELD_TYPES).toEqual(['string', 'number', 'password', 'pin'])
    })

    it('is the exhaustive list of FieldType values', () => {
        const exhaustive: readonly FieldType[] = FIELD_TYPES
        expect(exhaustive).toHaveLength(4)
        const all: readonly FieldType[] = ['string', 'number', 'password', 'pin']
        for (const type of all) {
            expect(FIELD_TYPES).toContain(type)
        }
    })

    it('entries are distinct, non-empty strings', () => {
        expect(new Set(FIELD_TYPES).size).toBe(FIELD_TYPES.length)
        for (const type of FIELD_TYPES) {
            expect(type.length).toBeGreaterThan(0)
        }
    })
})
