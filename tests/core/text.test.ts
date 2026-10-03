import { describe, expect, it } from 'vitest'
import { extractMentionUserIds, isHtmlEmpty } from '@/core/text'

describe('isHtmlEmpty', () => {
    it('treats an empty string as empty', () => {
        expect(isHtmlEmpty('')).toBe(true)
    })

    it('treats tag-only markup as empty', () => {
        expect(isHtmlEmpty('<p></p>')).toBe(true)
        expect(isHtmlEmpty('<div><span></span></div>')).toBe(true)
        expect(isHtmlEmpty('<br/>')).toBe(true)
        expect(isHtmlEmpty('<img src="x.png">')).toBe(true)
    })

    it('treats whitespace-only content as empty', () => {
        expect(isHtmlEmpty('   ')).toBe(true)
        expect(isHtmlEmpty('<p>   </p>')).toBe(true)
        expect(isHtmlEmpty('<div>\n\t</div>')).toBe(true)
    })

    it('treats visible text as non-empty', () => {
        expect(isHtmlEmpty('Hello')).toBe(false)
        expect(isHtmlEmpty('<p>Hello</p>')).toBe(false)
        expect(isHtmlEmpty('<div><span>a</span> b</div>')).toBe(false)
    })

    it('strips tags recursively and ignores tag-like fragments', () => {
        expect(isHtmlEmpty('<p><b>text</b> <i>more</i></p>')).toBe(false)
        expect(isHtmlEmpty('a < b')).toBe(false) // "<" is not a full tag
    })
})

describe('extractMentionUserIds', () => {
    it('collects mention data-ids in order', () => {
        const html =
            '<p>Hi <span data-type="mention" data-id="u1">@Ada</span> and ' +
            '<span data-type="mention" data-id="u2">@Bob</span></p>'
        expect(extractMentionUserIds(html)).toEqual(['u1', 'u2'])
    })

    it('dedupes repeated mentions while preserving first-seen order', () => {
        const html =
            '<span data-type="mention" data-id="u2">@Bob</span>' +
            '<span data-type="mention" data-id="u1">@Ada</span>' +
            '<span data-type="mention" data-id="u2">@Bob</span>'
        expect(extractMentionUserIds(html)).toEqual(['u2', 'u1'])
    })

    it('ignores spans that are not mention nodes', () => {
        const html =
            '<span data-id="u1">plain</span>' +
            '<span data-type="mention">no id</span>' +
            '<span data-type="mention" data-id="">empty</span>' +
            '<a href="#" data-type="mention-nope" data-id="u9">x</a>'
        expect(extractMentionUserIds(html)).toEqual([])
    })

    it('returns [] for empty or tag-only html', () => {
        expect(extractMentionUserIds('')).toEqual([])
        expect(extractMentionUserIds('<p></p>')).toEqual([])
    })

    it('tolerates malformed html without throwing', () => {
        // Unterminated mention span with no data-id - the parser recovers, nothing to collect.
        expect(() => extractMentionUserIds('<div><p><span data-type="mention"')).not.toThrow()
        expect(extractMentionUserIds('<div><p><span data-type="mention"')).toEqual([])
    })
})
