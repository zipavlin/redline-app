import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { TooltipProvider } from 'reka-ui'
import Donut from '@/components/shared/ui/Donut.vue'
import type { DonutSegment } from '@/resources/report/home'

const segments: DonutSegment[] = [
    { status: 'new', label: 'New', count: 3, barClass: 'bg-error', strokeClass: 'stroke-error' },
    { status: 'done', label: 'Done', count: 1, barClass: 'bg-success/50', strokeClass: 'stroke-success/50' },
]

function mountDonut(props: { segments: DonutSegment[]; centerLabel?: string } = { segments }) {
    return mount(
        {
            components: { Donut, TooltipProvider },
            props: ['segments', 'centerLabel'],
            template: '<TooltipProvider><Donut :segments="segments" :center-label="centerLabel" /></TooltipProvider>',
        },
        {
            props,
            global: {
                stubs: {
                    UIcon: { template: '<span class="icon-stub"><slot /></span>', props: ['name'] },
                },
            },
        },
    )
}

describe('Donut', () => {
    it('renders the center total and default label', () => {
        const wrapper = mountDonut()

        expect(wrapper.text()).toContain('4')
        expect(wrapper.text()).toContain('reports')
    })

    it('renders one rounded arc per nonzero segment', () => {
        const wrapper = mountDonut()

        expect(wrapper.findAll('circle[stroke-linecap]')).toHaveLength(2)
        expect(wrapper.findAll('circle.stroke-error')).toHaveLength(1)
        expect(wrapper.findAll('circle.stroke-success\\/50')).toHaveLength(1)
    })

    it('renders the legend with labels and counts', () => {
        const wrapper = mountDonut()
        const text = wrapper.text()

        expect(text).toContain('New')
        expect(text).toContain('Done')
        expect(text).toContain('3')
        expect(text).toContain('1')
    })

    it('hides zero-count segments and shows the empty state', () => {
        const wrapper = mountDonut({
            segments: [{ status: 'new', label: 'New', count: 0, barClass: 'bg-error', strokeClass: 'stroke-error' }],
        })

        expect(wrapper.findAll('circle[stroke-linecap]')).toHaveLength(0)
        expect(wrapper.text()).toContain('No reports yet')
        expect(wrapper.find('.grid.grid-cols-2').exists()).toBe(false)
    })

    it('shows the dashed placeholder ring when there are no reports at all', () => {
        const wrapper = mountDonut({ segments: [] })

        expect(wrapper.text()).toContain('No reports yet')
        expect(wrapper.find('circle.text-muted').exists()).toBe(true)
        expect(wrapper.findAll('circle[stroke-linecap]')).toHaveLength(0)
    })

    it('uses a custom center label', () => {
        const wrapper = mountDonut({ segments, centerLabel: 'bugs' })

        expect(wrapper.text()).toContain('bugs')
    })
})
