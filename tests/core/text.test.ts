import { describe, expect, it } from 'vitest'
import { isHtmlEmpty } from '@/core/text'

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
