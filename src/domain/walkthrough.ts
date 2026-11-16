/**
 * Walkthrough step model - pure, so step selection is testable without mounting
 * anything (and cannot drift from which controls the toolbar actually renders).
 */
export type WalkthroughStepId = 'comment' | 'filter' | 'menu' | 'pin' | 'body' | 'submit'

/** Toolbar buttons a step can highlight; the form steps sit outside the toolbar column. */
export type WalkthroughTarget = 'comment' | 'filter' | 'menu'

export interface WalkthroughStep {
    id: WalkthroughStepId
    title: string
    body: string
    target?: WalkthroughTarget
}

/** What the widget can show right now, read from the store by the composable. */
export interface WalkthroughFacts {
    authenticated: boolean
    guest: boolean
    /** The toolbar's action stack exists only while expanded. */
    expanded: boolean
    /** The create-report composer is open (a pin was placed). */
    reportOpen: boolean
}

const TOOLBAR_STEPS: readonly WalkthroughStep[] = [
    {
        id: 'comment',
        title: 'Pin a comment',
        body: 'Click here, then click anything on the page to mark it.',
        target: 'comment',
    },
    {
        id: 'filter',
        title: 'Filter the pins',
        body: 'Switch between unresolved reports and every report on this page.',
        target: 'filter',
    },
    {
        id: 'menu',
        title: 'Your account',
        body: 'Position, appearance, filters and log out live here.',
        target: 'menu',
    },
]

const FORM_STEPS: readonly WalkthroughStep[] = [
    { id: 'body', title: 'Describe the issue', body: 'Say what is wrong - your text is attached to the pin.' },
    { id: 'submit', title: 'Send it', body: 'Submit sends the report to the dashboard for review.' },
]

const PIN_STEP: WalkthroughStep = {
    id: 'pin',
    title: 'Create your first report',
    body: 'Place a pin anywhere on the page to open the report form.',
}

export function walkthroughSteps(facts: WalkthroughFacts): WalkthroughStep[] {
    // Guests have no walkthrough flag, so the widget's tour is authenticated-only.
    if (!facts.authenticated || facts.guest) return []
    // A collapsed toolbar renders none of the three target buttons.
    if (!facts.expanded) return []
    return [...TOOLBAR_STEPS, ...(facts.reportOpen ? FORM_STEPS : [PIN_STEP])]
}
