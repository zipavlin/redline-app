import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    buildAttributeAnchor,
    buildIndexPath,
    buildNthChild,
    buildNthOfType,
    buildOrdinal,
    buildXPath,
    getCssSelector,
    resolveSelector,
} from '@/core/selector'

/** Replace document.body's contents and return the element matching `selector`. */
function seed(inner: string, selector: string): Element {
    document.body.innerHTML = inner
    const el = document.querySelector(selector)
    if (!el) throw new Error(`seed: no element for "${selector}"`)
    return el
}

/** Stub document.evaluate + the XPathResult global (absent in happy-dom). */
function stubEvaluate(singleNodeValue: Element | null) {
    const evaluate = vi.fn(() => ({ singleNodeValue }) as unknown as XPathResult)
    Object.defineProperty(document, 'evaluate', { configurable: true, value: evaluate })
    vi.stubGlobal('XPathResult', { FIRST_ORDERED_NODE_TYPE: 9 })
    return evaluate
}

afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    // Remove the evaluate stub we may have installed; happy-dom defines none.
    delete (document as unknown as Record<string, unknown>).evaluate
})

describe('resolveSelector', () => {
    it('returns null for empty / nullish selectors', () => {
        expect(resolveSelector(null)).toBeNull()
        expect(resolveSelector(undefined)).toBeNull()
        expect(resolveSelector('')).toBeNull()
    })

    it('resolves a plain CSS selector', () => {
        const btn = seed('<button id="save">Go</button>', 'button')
        expect(resolveSelector('body > button#save')).toBe(btn)
    })

    it('resolves the path:: index-path format', () => {
        const btn = seed('<div><button>Go</button></div>', 'button')
        const sel = buildIndexPath(btn, document)
        expect(sel.startsWith('path::')).toBe(true)
        expect(resolveSelector(sel)).toBe(btn)
    })

    it('resolves the ordinal:: format', () => {
        const btn = seed('<div><button>Go</button></div>', 'button')
        const sel = buildOrdinal(btn, document)
        expect(sel?.startsWith('ordinal::')).toBe(true)
        expect(resolveSelector(sel!)).toBe(btn)
    })

    it('resolves the xpath:: format via document.evaluate', () => {
        const btn = seed('<div><button>Go</button></div>', 'button')
        const evaluate = stubEvaluate(btn)
        expect(resolveSelector('xpath::/html/*[2]/*[1]/*[1]')).toBe(btn)
        expect(evaluate).toHaveBeenCalledWith(
            '/html/*[2]/*[1]/*[1]', document, null, 9, null,
        )
    })

    it('returns null when the xpath pass does not match anything', () => {
        const btn = seed('<div><button>Go</button></div>', 'button')
        stubEvaluate(null)
        expect(resolveSelector('xpath::/html/*[2]/*[9]')).toBeNull()
    })

    it('returns null for an out-of-range index path', () => {
        seed('<div><button>Go</button></div>', 'button')
        expect(resolveSelector('path::1,0,0,0,0,99')).toBeNull()
    })
})

describe('buildNthOfType', () => {
    it('walks the tag chain with no index for unique siblings', () => {
        const span = seed('<div><section><span>t</span></section></div>', 'span')
        expect(buildNthOfType(span, document)).toBe('body > div > section > span')
    })

    it('indexes by position among same-tag siblings only', () => {
        const liB = seed('<ul><li>a</li><li>b</li></ul>', 'li:nth-of-type(2)')
        expect(buildNthOfType(liB, document)).toBe('body > ul > li:nth-of-type(2)')
    })

    it('ignores interleaved different-tag siblings', () => {
        const iB = seed('<div><i>a</i><b>c</b><i>b</i></div>', 'div > i:nth-of-type(2)')
        expect(buildNthOfType(iB, document)).toBe('body > div > i:nth-of-type(2)')
    })

    it('anchors at the nearest ancestor id', () => {
        const span = seed('<div id="app"><span>t</span></div>', 'span')
        expect(buildNthOfType(span, document)).toBe('div#app > span')
    })

    it('uses the element id directly', () => {
        const btn = seed('<button id="save">Go</button>', 'button')
        expect(buildNthOfType(btn, document)).toBe('button#save')
    })
})

describe('buildNthChild', () => {
    it('uses absolute child positions at every level (no tag names)', () => {
        const liB = seed('<ul><li>a</li><li>b</li></ul>', 'li:nth-of-type(2)')
        /**
         * Body is the 2nd element child of <html> (head first), ul is the 1st of body,
         * li b is the 2nd of ul.
         */
        expect(buildNthChild(liB, document)).toBe('*:nth-child(2) > *:nth-child(1) > *:nth-child(2)')
    })

    it('includes intermediate levels and stays resolvable', () => {
        const liB = seed('<div><section><ul><li>a</li><li>b</li></ul></section></div>', 'li:nth-of-type(2)')
        const sel = buildNthChild(liB, document)
        expect(sel).toBe('*:nth-child(2) > *:nth-child(1) > *:nth-child(1) > *:nth-child(1) > *:nth-child(2)')
        expect(resolveSelector(sel)).toBe(liB)
    })

    it('anchors at the nearest ancestor id', () => {
        const span = seed('<div id="app"><span>t</span></div>', 'span')
        expect(buildNthChild(span, document)).toBe('div#app > *:nth-child(1)')
    })
})

describe('buildAttributeAnchor', () => {
    it('selects on a unique data-testid', () => {
        const btn = seed('<button data-testid="save">Go</button>', 'button')
        expect(buildAttributeAnchor(btn, document)).toBe('[data-testid="save"]')
        expect(resolveSelector('[data-testid="save"]')).toBe(btn)
    })

    it('prefers data-id over data-testid', () => {
        const btn = seed('<button data-id="a" data-testid="b">Go</button>', 'button')
        expect(buildAttributeAnchor(btn, document)).toBe('[data-id="a"]')
    })

    it('falls back to name and aria-label', () => {
        const input = seed('<input name="email">', 'input')
        expect(buildAttributeAnchor(input, document)).toBe('[name="email"]')

        const close = seed('<div aria-label="Close">x</div>', 'div')
        expect(buildAttributeAnchor(close, document)).toBe('[aria-label="Close"]')
    })

    it('returns null when the value is not unique', () => {
        seed('<div><button data-testid="x">1</button><button data-testid="x">2</button></div>', 'div > button:nth-of-type(2)')
        const second = document.querySelectorAll('button')[1]!
        expect(buildAttributeAnchor(second, document)).toBeNull()
    })

    it('uses any generic data-* attribute as a last resort', () => {
        const div = seed('<div data-foo="bar">x</div>', 'div')
        expect(buildAttributeAnchor(div, document)).toBe('[data-foo="bar"]')
    })

    it('escapes values through CSS.escape and stays resolvable', () => {
        const btn = seed('<button data-testid="a.b">Go</button>', 'button')
        const sel = buildAttributeAnchor(btn, document)
        expect(sel).toBe(`[data-testid="${CSS.escape('a.b')}"]`)
        expect(resolveSelector(sel!)).toBe(btn)
    })

    it('returns null when there are no usable attributes', () => {
        const span = seed('<div><span>t</span></div>', 'span')
        expect(buildAttributeAnchor(span, document)).toBeNull()
    })
})

describe('buildXPath', () => {
    it('builds an unanchored /html path', () => {
        const span = seed('<div><section><span>t</span></section></div>', 'span')
        expect(buildXPath(span, document)).toBe('xpath::/html/*[2]/*[1]/*[1]/*[1]')
    })

    it('anchors at the nearest ancestor id', () => {
        const liB = seed('<div id="root"><ul><li>a</li><li>b</li></ul></div>', 'li:nth-of-type(2)')
        expect(buildXPath(liB, document)).toBe('xpath::id("root")/*[1]/*[2]')
    })

    it('emits a bare id() anchor when the element itself has an id', () => {
        const btn = seed('<button id="save">Go</button>', 'button')
        expect(buildXPath(btn, document)).toBe('xpath::id("save")')
    })
})

describe('buildIndexPath', () => {
    it('records zero-based children[] indices from the document element', () => {
        const liB = seed('<div id="root"><ul><li>a</li><li>b</li></ul></div>', 'li:nth-of-type(2)')
        expect(buildIndexPath(liB, document)).toBe('path::1,0,0,1')
    })

    it('round-trips through resolveSelector', () => {
        const liB = seed('<div id="root"><ul><li>a</li><li>b</li></ul></div>', 'li:nth-of-type(2)')
        expect(resolveSelector(buildIndexPath(liB, document))).toBe(liB)
    })
})

describe('buildOrdinal', () => {
    it('assigns the zero-based DFS index across all elements', () => {
        const btn = seed('<div><button>Go</button></div>', 'button')
        const expected = [...document.querySelectorAll('*')].indexOf(btn)
        expect(buildOrdinal(btn, document)).toBe(`ordinal::${expected}`)
    })

    it('round-trips through resolveSelector', () => {
        const btn = seed('<div><button>Go</button></div>', 'button')
        expect(resolveSelector(buildOrdinal(btn, document)!)).toBe(btn)
    })
})

describe('getCssSelector', () => {
    it('returns "" for nullish or root elements', () => {
        expect(getCssSelector(null)).toBe('')
        expect(getCssSelector(undefined)).toBe('')
        expect(getCssSelector(document.documentElement)).toBe('')
        expect(getCssSelector(document.body)).toBe('')
    })

    it('round-trips for a simple nested element', () => {
        const span = seed('<div><section><span>t</span></section></div>', 'span')
        expect(resolveSelector(getCssSelector(span))).toBe(span)
    })

    it('round-trips for same-tag siblings', () => {
        const liB = seed('<ul><li>a</li><li>b</li><li>c</li></ul>', 'li:nth-of-type(2)')
        expect(resolveSelector(getCssSelector(liB))).toBe(liB)
    })

    it('round-trips for an element with an id', () => {
        const span = seed('<div id="app"><span>t</span></div>', 'span')
        expect(getCssSelector(span)).toBe('div#app > span')
        expect(resolveSelector(getCssSelector(span))).toBe(span)
    })

    it('PINS: the nth-of-type pass wins before the attribute anchor', () => {
        /**
         * Even with a stable data-testid, pass 1 succeeds first, so the
         * compact tag selector is returned - not the attribute anchor.
         */
        const btn = seed('<div><button data-testid="save">Go</button></div>', 'button')
        expect(getCssSelector(btn)).toBe('body > div > button')
    })

    it('falls through to the attribute anchor when the id breaks nth-of-type', () => {
        /**
         * id="a.b" makes `button#a.b` match nothing (id+class selector), so
         * passes 1-2 fail; the unique data-testid then wins.
         */
        const btn = seed('<button id="a.b" data-testid="save">Go</button>', 'button')
        expect(getCssSelector(btn)).toBe('[data-testid="save"]')
    })

    it('falls through to the index path when xpath cannot resolve', () => {
        const span = seed('<div id="a.b"><span>t</span></div>', 'span')
        // XPath pass returns nothing (evaluate stub), so path:: wins.
        stubEvaluate(null)
        const sel = getCssSelector(span)
        expect(sel.startsWith('path::')).toBe(true)
        expect(resolveSelector(sel)).toBe(span)
    })

    it('uses the xpath pass when it resolves', () => {
        const span = seed('<div id="a.b"><span>t</span></div>', 'span')
        stubEvaluate(span)
        expect(getCssSelector(span)).toBe('xpath::id("a.b")/*[1]')
    })
})
