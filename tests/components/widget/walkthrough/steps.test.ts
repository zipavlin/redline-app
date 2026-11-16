import { describe, expect, it } from 'vitest'
import { walkthroughSteps } from '@/domain/walkthrough'

const authed = { authenticated: true, guest: false, expanded: true, reportOpen: false }

describe('walkthroughSteps', () => {
    it('walks the toolbar buttons, then asks for a pin', () => {
        expect(walkthroughSteps(authed).map(step => step.id)).toEqual(['comment', 'filter', 'menu', 'pin'])
    })

    it('targets only toolbar buttons that exist while expanded', () => {
        const targets = walkthroughSteps(authed).flatMap(step => (step.target ? [step.target] : []))
        expect(targets).toEqual(['comment', 'filter', 'menu'])
    })

    it('drops the filter step (and the rest) when the toolbar is collapsed', () => {
        const ids = walkthroughSteps({ ...authed, expanded: false }).map(step => step.id)
        expect(ids).not.toContain('filter')
        expect(ids).toEqual([])
    })

    it('uses the report-form steps only while the create-report panel is open', () => {
        expect(walkthroughSteps({ ...authed, reportOpen: true }).map(step => step.id)).toEqual([
            'comment',
            'filter',
            'menu',
            'body',
            'submit',
        ])
    })

    it('gives guests and signed-out visitors no steps', () => {
        expect(walkthroughSteps({ ...authed, guest: true })).toEqual([])
        expect(walkthroughSteps({ ...authed, authenticated: false })).toEqual([])
    })
})
