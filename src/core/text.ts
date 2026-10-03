// Text helpers. `isHtmlEmpty` is pure (no DOM); `extractMentionUserIds` uses
// DOMParser and therefore needs a DOM (browser or happy-dom in tests).

/**
 * True when an HTML string has no visible text once tags are stripped (used to gate
 * empty rich-text editor submissions). Whitespace-only content counts as empty.
 */
export function isHtmlEmpty(html: string): boolean {
    return html.replace(/<[^>]*>/g, '').trim().length === 0
}

/**
 * Collect the user ids referenced by mention nodes in a body
 * (`<span data-type="mention" data-id="...">@Name</span>`). Order-preserving and
 * deduped; malformed or empty input yields `[]`.
 */
export function extractMentionUserIds(html: string): string[] {
    if (!html) return []
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const ids: string[] = []
    for (const node of doc.querySelectorAll('[data-type="mention"]')) {
        const id = node.getAttribute('data-id')
        if (id && !ids.includes(id)) ids.push(id)
    }
    return ids
}
