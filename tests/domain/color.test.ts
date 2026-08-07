import { describe, expect, it } from 'vitest'
import { COLORS } from '@/domain/color'

describe('COLORS palette', () => {
    it('exposes the six documented colors in order', () => {
        expect(COLORS.map(c => c.key)).toEqual(['error', 'warning', 'success', 'info', 'black', 'white'])
    })

    it('matches the documented key/label/value table', () => {
        expect(COLORS).toEqual([
            { key: 'error', label: 'Red', value: '#ff637e' },
            { key: 'warning', label: 'Yellow', value: '#fdc700' },
            { key: 'success', label: 'Green', value: '#9ae600' },
            { key: 'info', label: 'Blue', value: '#00d5be' },
            { key: 'black', label: 'Black', value: '#000000' },
            { key: 'white', label: 'White', value: '#ffffff' },
        ])
    })

    it('keys are unique and every color has a non-empty label and 6-digit hex value', () => {
        const keys = COLORS.map(c => c.key)
        expect(new Set(keys).size).toBe(COLORS.length)
        for (const color of COLORS) {
            expect(color.label.length).toBeGreaterThan(0)
            expect(color.value).toMatch(/^#[0-9a-f]{6}$/)
        }
    })

    it('values are unique', () => {
        const values = COLORS.map(c => c.value)
        expect(new Set(values).size).toBe(COLORS.length)
    })

    it('covers the semantic colors used by status metadata', () => {
        const keys = COLORS.map(c => c.key)
        for (const semantic of ['error', 'warning', 'success', 'info']) {
            expect(keys).toContain(semantic)
        }
    })
})
