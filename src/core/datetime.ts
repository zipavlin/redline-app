// Date/time formatting — pure (Date/Intl only, no DOM). Shared by widget + dashboard.

// Human-readable relative time ("Just now", "3 min ago", …) from an ISO timestamp.
export function getRelativeTime(iso?: string | undefined): string {
    if (!iso) {
        return ''
    }
    const diff = Date.now() - new Date(iso).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`
    return new Date(iso).toLocaleDateString()
}

// Formats an ISO timestamp via Intl.DateTimeFormat. Defaults to "12 Jun 2025, 14:30" style.
export function getFormattedDatetime(
    iso?: string | undefined,
    locale = 'en-GB',
    format: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
    if (!iso) {
        return ''
    }
    return new Intl.DateTimeFormat(locale, format).format(new Date(iso))
}

// Formats a total-seconds count as "MM:SS" (e.g. 90 → "01:30").
export function getFormattedSeconds(totalSeconds: number): string {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
}
