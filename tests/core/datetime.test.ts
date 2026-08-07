import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFormattedDatetime, getFormattedSeconds, getRelativeTime } from '@/core/datetime'

const NOW = new Date('2025-06-01T12:00:00Z')

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
})

afterEach(() => {
    vi.useRealTimers()
})

describe('getRelativeTime', () => {
    it('returns "" for empty input', () => {
        expect(getRelativeTime()).toBe('')
        expect(getRelativeTime('')).toBe('')
    })

    it('returns "Just now" for anything under a minute', () => {
        expect(getRelativeTime('2025-06-01T12:00:00Z')).toBe('Just now') // 0s
        expect(getRelativeTime('2025-06-01T11:59:01Z')).toBe('Just now') // 59s
    })

    it('returns "Just now" for future timestamps', () => {
        expect(getRelativeTime('2025-06-01T12:00:30Z')).toBe('Just now')
    })

    it('formats minutes', () => {
        expect(getRelativeTime('2025-06-01T11:59:00Z')).toBe('1 min ago')
        expect(getRelativeTime('2025-06-01T11:01:00Z')).toBe('59 min ago')
    })

    it('formats hours without a day suffix', () => {
        expect(getRelativeTime('2025-06-01T11:00:00Z')).toBe('1h ago')
        expect(getRelativeTime('2025-05-31T13:00:00Z')).toBe('23h ago')
    })

    it('pluralizes days', () => {
        expect(getRelativeTime('2025-05-31T12:00:00Z')).toBe('1 day ago')
        expect(getRelativeTime('2025-05-30T12:00:00Z')).toBe('2 days ago')
        expect(getRelativeTime('2025-05-03T12:00:00Z')).toBe('29 days ago')
    })

    it('falls back to the locale date at 30 days', () => {
        const iso = '2025-05-02T12:00:00Z' // exactly 30 days before NOW
        expect(getRelativeTime(iso)).toBe(new Date(iso).toLocaleDateString())
        expect(getRelativeTime(iso)).not.toMatch(/days? ago/)
    })
})

describe('getFormattedDatetime', () => {
    it('returns "" for empty input', () => {
        expect(getFormattedDatetime()).toBe('')
        expect(getFormattedDatetime('')).toBe('')
    })

    it('formats with the default en-GB medium date + short time', () => {
        expect(getFormattedDatetime('2025-06-12T14:30:00')).toBe('12 Jun 2025, 14:30')
    })

    it('honours a custom locale', () => {
        expect(getFormattedDatetime('2025-06-12T14:30:00', 'de-DE')).toBe('12.06.2025, 14:30')
    })

    it('honours a custom format option', () => {
        const iso = '2025-06-12T14:30:00'
        expect(getFormattedDatetime(iso, 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }))
            .toBe('12/06/2025')
    })
})

describe('getFormattedSeconds', () => {
    it('formats seconds as MM:SS with zero padding', () => {
        expect(getFormattedSeconds(0)).toBe('00:00')
        expect(getFormattedSeconds(5)).toBe('00:05')
        expect(getFormattedSeconds(59)).toBe('00:59')
        expect(getFormattedSeconds(90)).toBe('01:30')
        expect(getFormattedSeconds(600)).toBe('10:00')
    })

    it('does not roll minutes over into hours (pads minutes to 2 digits only)', () => {
        expect(getFormattedSeconds(3600)).toBe('60:00')
        expect(getFormattedSeconds(3661)).toBe('61:01')
    })
})
