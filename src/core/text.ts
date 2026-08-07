// Text helpers - pure (no DOM).

/**
 * True when an HTML string has no visible text once tags are stripped (used to gate
 * empty rich-text editor submissions). Whitespace-only content counts as empty.
 */
export function isHtmlEmpty(html: string): boolean {
    return html.replace(/<[^>]*>/g, '').trim().length === 0
}
