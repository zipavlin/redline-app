/**
 * DOM selector generation and resolution. Browser I/O (reads the live DOM), so it
 * lives in core/, not domain/.
 */

/**
 * Resolves a selector produced by getCssSelector(). Handles plain CSS selectors
 * and the prefixed formats used by the XPath, index-path, and ordinal passes.
 */
export function resolveSelector(sel: string | null | undefined, doc: Document = document): Element | null {
    if (!sel) return null
    if (sel.startsWith('xpath::')) {
        const r = doc.evaluate(sel.slice(7), doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        return r.singleNodeValue as Element | null
    }
    if (sel.startsWith('path::')) {
        let cur: Element | undefined = doc.documentElement
        for (const idx of sel.slice(6).split(',').map(Number)) cur = cur?.children[idx]
        return cur || null
    }
    if (sel.startsWith('ordinal::')) {
        return doc.querySelectorAll('*')[+sel.slice(9)] || null
    }
    return doc.querySelector(sel)
}

/**
 * Pass 1 - CSS tag:nth-of-type
 * Walks up the DOM building tag-specific selectors. nth-of-type counts only
 * same-tag siblings, matching how the index is computed. Produces compact,
 * human-readable selectors; most elements stop here.
 */
export function buildNthOfType(el: Element, doc: Document): string {
    const parts: string[] = []
    let cur: Element | null = el
    while (cur && cur !== doc.documentElement) {
        if (cur.id) {
            parts.unshift(`${cur.tagName.toLowerCase()}#${cur.id}`)
            break
        }
        let part = cur.tagName.toLowerCase()
        if (cur.parentElement) {
            const sibs = [...cur.parentElement.children].filter(s => s.tagName === cur!.tagName)
            if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`
        }
        parts.unshift(part)
        cur = cur.parentElement
    }
    return parts.join(' > ')
}

/**
 * Pass 2 - CSS *:nth-child
 * Same walk but emits *:nth-child(n) at every level using the element's
 * absolute position among all siblings, bypassing tag filtering entirely.
 */
export function buildNthChild(el: Element, doc: Document): string {
    const parts: string[] = []
    let cur: Element | null = el
    while (cur && cur !== doc.documentElement) {
        if (cur.id) {
            parts.unshift(`${cur.tagName.toLowerCase()}#${cur.id}`)
            break
        }
        const idx = [...cur.parentElement!.children].indexOf(cur) + 1
        parts.unshift(`*:nth-child(${idx})`)
        cur = cur.parentElement
    }
    return parts.join(' > ')
}

/**
 * Pass 3 - attribute anchor
 * Scans the element for any attribute (data-*, name, aria-label) whose value
 * makes it uniquely selectable with a single [attr="val"] rule.
 */
export function buildAttributeAnchor(el: Element, doc: Document): string | null {
    const PRIORITY = ['data-id', 'data-testid', 'data-cy', 'data-qa', 'name', 'aria-label']
    const unique = (name: string, value: string): string | null => {
        const sel = `[${name}="${CSS.escape(value)}"]`
        return doc.querySelector(sel) === el ? sel : null
    }
    for (const attr of PRIORITY) {
        const val = el.getAttribute(attr)
        if (val) {
            const s = unique(attr, val)
            if (s) return s
        }
    }
    for (const { name, value } of el.attributes) {
        if (name.startsWith('data-') && value) {
            const s = unique(name, value)
            if (s) return s
        }
    }
    return null
}

/**
 * Pass 4 - XPath *[n] absolute position
 * Builds an XPath expression using absolute child-position steps (*[n]).
 * Anchors to the nearest ancestor with an id when available. Evaluated via
 * document.evaluate(); returned as "xpath::<expr>" for resolveSelector().
 */
export function buildXPath(el: Element, doc: Document): string {
    const parts: string[] = []
    let cur: Element | null = el
    let anchored = false
    while (cur && cur !== doc.documentElement) {
        if (cur.id) {
            parts.unshift(`id("${cur.id}")`)
            anchored = true
            break
        }
        const idx = [...cur.parentElement!.children].indexOf(cur) + 1
        parts.unshift(`*[${idx}]`)
        cur = cur.parentElement
    }
    if (!anchored) parts.unshift('/html')
    const expr = anchored
        ? parts[0] + (parts.length > 1 ? '/' + parts.slice(1).join('/') : '')
        : parts.join('/')
    return `xpath::${expr}`
}

/**
 * Pass 5 - DOM index path
 * Records each step as a zero-based children[] index from documentElement
 * down to el. Resolution traverses element.children[n] directly - no CSS
 * or XPath engine involved. Returned as "path::n,n,n" for resolveSelector().
 */
export function buildIndexPath(el: Element, doc: Document): string {
    const indices: number[] = []
    let cur: Element | null = el
    while (cur && cur !== doc.documentElement) {
        indices.unshift([...cur.parentElement!.children].indexOf(cur))
        cur = cur.parentElement
    }
    return `path::${indices.join(',')}`
}

/**
 * Pass 6 - TreeWalker ordinal
 * Last resort: assigns el its zero-based DFS index across all elements
 * (querySelectorAll('*')). Always unique but sensitive to any DOM mutation.
 * Returned as "ordinal::n" for resolveSelector().
 */
export function buildOrdinal(el: Element, doc: Document): string | null {
    const idx = [...doc.querySelectorAll('*')].indexOf(el)
    return idx >= 0 ? `ordinal::${idx}` : null
}

export function getCssSelector(el: Element | null | undefined): string {
    if (!el || el === document.documentElement || el === document.body) return ''
    const doc = el.ownerDocument

    for (const build of [buildNthOfType, buildNthChild, buildAttributeAnchor, buildXPath, buildIndexPath, buildOrdinal]) {
        const sel = build(el, doc)
        if (sel && resolveSelector(sel, doc) === el) return sel
    }
    return ''
}
