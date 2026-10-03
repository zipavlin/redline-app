import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Prose from '@/components/shared/ui/Prose.vue'

/**
 * Prose is a pure `v-html` renderer - it does not sanitize or rewrite markup, so a
 * stored mention span reaches the `.mention` chip rule with its `data-id` intact.
 * (Server-side sanitization happens on write; that allowlist is what decides whether
 * a span survives at all.)
 */
describe('Prose mention markup', () => {
    it('keeps a mention span and its data-id through rendering', () => {
        const wrapper = mount(Prose, {
            props: {
                html: '<p>Hi <span data-type="mention" class="mention" data-id="u1" data-label="Ada">@Ada</span></p>',
            },
        })

        const mention = wrapper.find('.redline-prose .mention')
        expect(mention.exists()).toBe(true)
        expect(mention.attributes('data-id')).toBe('u1')
        expect(mention.text()).toBe('@Ada')
    })

    it('renders nothing for a null body', () => {
        const wrapper = mount(Prose)

        expect(wrapper.find('.redline-prose').text()).toBe('')
    })
})
