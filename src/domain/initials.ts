/**
 * Display-name initials - mirrors the backend `User::getInitialsAttribute`
 * accessor (first character of the first two space-separated words, uppercased).
 * Used for optimistic self-entries before the server list arrives.
 */
export function initialsFromName(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word.charAt(0).toUpperCase())
        .join('')
}
