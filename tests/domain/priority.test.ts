import { describe, expect, it } from 'vitest'
import {
    PRIORITIES,
    PRIORITY_META,
    priorityColor,
    priorityLabel,
    priorityIcon,
} from '@/domain/priority'
import type { Priority } from '@/domain/priority'

describe('PRIORITY_META', () => {
    it('has an entry for every priority and nothing else', () => {
        expect(Object.keys(PRIORITY_META).sort()).toEqual([...PRIORITIES].sort())
    })

    it('orders entries by ascending severity', () => {
        expect(Object.keys(PRIORITY_META)).toEqual([...PRIORITIES])
    })

    it('exposes the documented label/icon/color/dot per priority', () => {
        expect(PRIORITY_META).toEqual({
            low:      { label: 'Low',      icon: 'i-lucide-arrow-down', color: 'neutral', dot: 'bg-neutral' },
            normal:   { label: 'Normal',   icon: 'i-lucide-minus',      color: 'info',    dot: 'bg-info' },
            high:     { label: 'High',     icon: 'i-lucide-arrow-up',   color: 'warning', dot: 'bg-warning' },
            critical: { label: 'Critical', icon: 'i-lucide-flame',      color: 'error',   dot: 'bg-error' },
        })
    })

    it('every entry is fully populated with icon/bg utility classes', () => {
        for (const priority of PRIORITIES) {
            const meta = PRIORITY_META[priority]
            expect(meta.label.length).toBeGreaterThan(0)
            expect(meta.icon.startsWith('i-')).toBe(true)
            expect(meta.dot.startsWith('bg-')).toBe(true)
        }
    })
})

describe('priority accessors', () => {
    it('priorityLabel / priorityColor / priorityIcon return the metadata for each priority', () => {
        for (const priority of PRIORITIES) {
            expect(priorityLabel(priority)).toBe(PRIORITY_META[priority].label)
            expect(priorityColor(priority)).toBe(PRIORITY_META[priority].color)
            expect(priorityIcon(priority)).toBe(PRIORITY_META[priority].icon)
        }
    })

    it('escalates color from neutral to error across the priority order', () => {
        expect(PRIORITIES.map(priorityColor)).toEqual(['neutral', 'info', 'warning', 'error'])
    })

    it('falls back gracefully for an unknown priority', () => {
        const unknown = 'bogus' as unknown as Priority
        expect(priorityLabel(unknown)).toBe('bogus')
        expect(priorityIcon(unknown)).toBe('bogus')
        expect(priorityColor(unknown)).toBe('neutral')
    })
})
