import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PopoverMenu from '@/components/shared/ui/PopoverMenu.vue'

/**
 * The real UPopover (Reka) renders in happy-dom: the trigger button lives in the
 * wrapper, and the items render into a portal on document.body once opened.
 */
interface TestItem {
    label?: string
    icon: string
    color?: string
    onClick?: ((event: MouseEvent) => void) | ((event: MouseEvent) => void)[]
}

const itemsInBody = (text: string) =>
    [...document.body.querySelectorAll('button')].some(button => button.textContent?.includes(text))

const bodyItem = (text: string) =>
    [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text))

function clickBodyItem(text: string) {
    const button = bodyItem(text)
    if (!button) throw new Error(`No item button "${text}" in document.body`)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function mountMenu(items: TestItem[], slots: Record<string, string> = {}) {
    return mount(PopoverMenu, {
        props: {
            items: items as never,
            trigger: { icon: 'i-lucide-ellipsis', size: 'xs', variant: 'ghost' },
        },
        slots,
    })
}

async function openMenu(wrapper: ReturnType<typeof mountMenu>) {
    await wrapper.find('[data-slot="base"]').trigger('click')
    // Opening renders into a portal; give Reka's positioning a moment.
    await new Promise(resolve => setTimeout(resolve, 30))
}

/**
 * Reka unmounts the portal content asynchronously (rAF/timer-driven), so poll
 * for the expected state instead of assuming a fixed number of ticks.
 */
async function waitFor(condition: () => boolean, timeoutMs = 500) {
    const start = Date.now()
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
        await new Promise(resolve => setTimeout(resolve, 10))
    }
}

describe('PopoverMenu close-on-select', () => {
    it('closes the popover when a default-rendered item is selected', async () => {
        const wrapper = mountMenu([{ label: 'Edit', icon: 'i-lucide-pencil', onClick: vi.fn<(e: MouseEvent) => void>() }])
        await openMenu(wrapper)
        expect(itemsInBody('Edit')).toBe(true)

        clickBodyItem('Edit')

        await waitFor(() => !itemsInBody('Edit'))
        expect(wrapper.find('[data-slot="base"]').attributes('aria-expanded')).toBe('false')
    })

    it('runs the selected item handler with the click event', async () => {
        const handler = vi.fn<(e: MouseEvent) => void>()
        const wrapper = mountMenu([{ label: 'Delete', icon: 'i-lucide-trash-2', onClick: handler }])
        await openMenu(wrapper)

        clickBodyItem('Delete')

        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
    })

    it('runs every handler when onClick is an array of handlers', async () => {
        const first = vi.fn<(e: MouseEvent) => void>()
        const second = vi.fn<(e: MouseEvent) => void>()
        const wrapper = mountMenu([{ label: 'Edit', icon: 'i-lucide-pencil', onClick: [first, second] }])
        await openMenu(wrapper)

        clickBodyItem('Edit')

        expect(first).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledTimes(1)
    })

    it('closes even when the item has no onClick handler', async () => {
        const wrapper = mountMenu([{ label: 'Inert', icon: 'i-lucide-circle' }])
        await openMenu(wrapper)
        expect(itemsInBody('Inert')).toBe(true)

        clickBodyItem('Inert')

        await waitFor(() => !itemsInBody('Inert'))
    })

    it('does NOT auto-close items rendered through the generic #item slot', async () => {
        const handler = vi.fn<(e: MouseEvent) => void>()
        const wrapper = mountMenu(
            [{ label: 'Color', icon: 'i-lucide-circle', onClick: handler }],
            { item: '<button class="custom-item" @click="item.onClick">{{ item.label }}</button>' },
        )
        await openMenu(wrapper)

        const custom = bodyItem('Color')
        expect(custom?.classList.contains('custom-item')).toBe(true)
        custom!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
        await nextTick()

        expect(handler).toHaveBeenCalledTimes(1)
        // Slot-rendered items own their click handling - the menu stays open.
        await new Promise(resolve => setTimeout(resolve, 30))
        expect(document.body.querySelector('.custom-item')).toBeTruthy()
    })
})
