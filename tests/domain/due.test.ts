import { describe, expect, it } from 'vitest'
import {
    dueColor,
    dueIcon,
    dueShortLabel,
    dueState,
    isDueAtUsable,
} from '@/domain/due'
import type { DueState } from '@/domain/due'

/** Frozen reference clock so every relative timestamp is deterministic. */
const NOW = Date.parse('2026-07-01T12:00:00Z')
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('due presentation accessors', () => {
    it('returns an icon and colour for every presentation state', () => {
        const states: DueState[] = ['none', 'overdue', 'due_soon', 'later', 'parked']
        for (const state of states) {
            expect(dueIcon(state)).toBeTruthy()
            expect(dueColor(state)).toBeTruthy()
        }
    })
})

describe('dueState', () => {
    it('returns none for a missing or empty due date', () => {
        expect(dueState(null, 'new', NOW)).toBe('none')
        expect(dueState(undefined, 'new', NOW)).toBe('none')
        expect(dueState('', 'new', NOW)).toBe('none')
    })

    it('parks a closed report regardless of a stale deadline', () => {
        expect(dueState(iso(-3 * DAY), 'resolved', NOW)).toBe('parked')
        expect(dueState(iso(3 * DAY), 'done', NOW)).toBe('parked')
    })

    it('flags an open report whose deadline has passed as overdue', () => {
        expect(dueState(iso(-1), 'new', NOW)).toBe('overdue')
        expect(dueState(iso(-2 * DAY), 'progress', NOW)).toBe('overdue')
    })

    it('flags an open report due within 24h as due_soon', () => {
        expect(dueState(iso(1), 'noticed', NOW)).toBe('due_soon')
        expect(dueState(iso(23 * HOUR), 'progress', NOW)).toBe('due_soon')
    })

    it('treats exactly-now as due_soon', () => {
        expect(dueState(iso(0), 'new', NOW)).toBe('due_soon')
    })

    it('leaves an open report due beyond 24h as later', () => {
        expect(dueState(iso(24 * HOUR), 'new', NOW)).toBe('later')
        expect(dueState(iso(10 * DAY), 'progress', NOW)).toBe('later')
    })

    it('treats an unparseable due date as no deadline', () => {
        expect(dueState('not-a-date', 'new')).toBe('none')
    })
})

describe('dueShortLabel', () => {
    it('floors the absolute distance to minutes under an hour', () => {
        expect(dueShortLabel(iso(45 * MIN + 30_000), NOW)).toBe('45m')
        expect(dueShortLabel(iso(59 * MIN), NOW)).toBe('59m')
    })

    it('rolls to hours at 60m and back down at 24h', () => {
        expect(dueShortLabel(iso(60 * MIN), NOW)).toBe('1h')
        expect(dueShortLabel(iso(7 * HOUR), NOW)).toBe('7h')
        expect(dueShortLabel(iso(23 * HOUR + 59 * MIN), NOW)).toBe('23h')
    })

    it('rolls to days at 24h and back down at 7d', () => {
        expect(dueShortLabel(iso(24 * HOUR), NOW)).toBe('1d')
        expect(dueShortLabel(iso(3 * DAY), NOW)).toBe('3d')
        expect(dueShortLabel(iso(6 * DAY + 23 * HOUR), NOW)).toBe('6d')
    })

    it('rolls to whole weeks at 7d (no months)', () => {
        expect(dueShortLabel(iso(7 * DAY), NOW)).toBe('1w')
        expect(dueShortLabel(iso(13 * DAY), NOW)).toBe('1w')
        expect(dueShortLabel(iso(14 * DAY), NOW)).toBe('2w')
    })

    it('keeps the same magnitude label for an overdue deadline', () => {
        expect(dueShortLabel(iso(-3 * DAY), NOW)).toBe('3d')
        expect(dueShortLabel(iso(-45 * MIN), NOW)).toBe('45m')
    })

    it('returns an empty label for an unparseable due date', () => {
        expect(dueShortLabel('not-a-date')).toBe('')
    })
})

describe('isDueAtUsable', () => {
    it('accepts only values that parse as dates', () => {
        expect(isDueAtUsable(null)).toBe(false)
        expect(isDueAtUsable(undefined)).toBe(false)
        expect(isDueAtUsable('')).toBe(false)
        expect(isDueAtUsable('not-a-date')).toBe(false)
        expect(isDueAtUsable(iso(0))).toBe(true)
    })
})

describe('dueColor / dueIcon', () => {
    it('maps each presentation state to its meta, folding later/parked onto set', () => {
        expect(dueColor('none')).toBe('neutral')
        expect(dueColor('later')).toBe('neutral')
        expect(dueColor('parked')).toBe('neutral')
        expect(dueColor('due_soon')).toBe('warning')
        expect(dueColor('overdue')).toBe('error')

        expect(dueIcon('none')).toBe('i-lucide-clock-fading')
        expect(dueIcon('later')).toBe('i-lucide-clock')
        expect(dueIcon('parked')).toBe('i-lucide-clock')
        expect(dueIcon('due_soon')).toBe('i-lucide-clock-alert')
        expect(dueIcon('overdue')).toBe('i-lucide-clock-alert')
    })

    it('falls back gracefully for an unknown state', () => {
        const unknown = 'bogus' as unknown as DueState
        expect(dueColor(unknown)).toBe('neutral')
        expect(dueIcon(unknown)).toBe('i-lucide-clock-fading')
    })
})


/**
 * The display math must compare the stored UTC instant against the same epoch clock
 * as `now`, not against wall-clock text. Building both sides from local Date
 * components keeps the assertion meaningful at any host offset (the test host runs
 * at Europe/Ljubljana, UTC+2 on the frozen 2026-06-15 date).
 */
describe('due display math across zones', () => {
    it('compares a stored UTC instant with a local now on the epoch timeline', () => {
        const localNow = new Date(2026, 5, 15, 12, 0, 0, 0)
        const stored = new Date(2026, 5, 15, 16, 0, 0, 0).toISOString()

        expect(dueShortLabel(stored, localNow.getTime())).toBe('4h')
        expect(dueState(stored, 'new', localNow.getTime())).toBe('due_soon')
    })

    it('flags the same instant as overdue once the local clock passes it', () => {
        const stored = new Date(2026, 5, 15, 16, 0, 0, 0).toISOString()
        const afterDue = new Date(2026, 5, 15, 17, 0, 0, 0).getTime()

        expect(dueState(stored, 'new', afterDue)).toBe('overdue')
        expect(dueShortLabel(stored, afterDue)).toBe('1h')
    })
})
