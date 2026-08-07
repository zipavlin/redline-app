import { afterEach, describe, expect, it } from 'vitest'
import {
    DASHBOARD_LOADER_ID,
    createDashboardLoader,
    removeDashboardLoader,
    showDashboardLoader,
} from '@/core/dashboard-loader'

const LOADER_TEXT = 'Redline dashboard is loading'

/** Logo.vue wave path - must be shared verbatim by both paths. */
const WAVE_PATH =
    'M3.742 48C7.492 44 11.242 44 14.992 48C18.742 52 22.492 52 26.242 48C29.992 44 33.742 44 37.492 48C41.242 52 44.992 52 48.742 48'

afterEach(() => {
    removeDashboardLoader()
    document.body.innerHTML = ''
})

describe('createDashboardLoader', () => {
    it('builds the ARIA status wrapper with the exact loader copy', () => {
        const loader = createDashboardLoader()

        expect(loader.id).toBe(DASHBOARD_LOADER_ID)
        expect(loader.getAttribute('role')).toBe('status')
        expect(loader.getAttribute('aria-live')).toBe('polite')
        expect(loader.textContent).toContain(LOADER_TEXT)
    })

    it('contains the wave svg (hidden from assistive tech) with a track and a sweep path', () => {
        const loader = createDashboardLoader()
        const svg = loader.querySelector('svg')

        expect(svg).not.toBeNull()
        expect(svg?.getAttribute('aria-hidden')).toBe('true')
        expect(svg?.getAttribute('viewBox')).toBe('0 0 52 53')
        expect(svg?.getAttribute('width')).toBe('48')
        expect(svg?.getAttribute('height')).toBe('48')
        expect(svg?.getAttribute('fill')).toBe('none')

        const paths = svg?.querySelectorAll('path') ?? []
        expect(paths).toHaveLength(2)
        expect(paths[0]?.getAttribute('d')).toBe(WAVE_PATH)
        expect(paths[1]?.getAttribute('d')).toBe(WAVE_PATH)
        expect(paths[0]?.getAttribute('class')).toBe('redline-loader-track')
        expect(paths[1]?.getAttribute('class')).toBe('redline-loader-sweep')
        // Sweep dash styling lives in CSS (redline-dashboard.css), not attributes.
        expect(paths[1]?.getAttribute('stroke-dasharray')).toBeNull()
        expect(paths[1]?.getAttribute('stroke-dashoffset')).toBeNull()
    })
})

describe('showDashboardLoader', () => {
    it('appends the loader to document.body by default', () => {
        const loader = showDashboardLoader()

        expect(document.body.contains(loader)).toBe(true)
        expect(document.body.querySelector('#' + DASHBOARD_LOADER_ID)).toBe(loader)
    })

    it('appends the loader to a custom target element', () => {
        const target = document.createElement('div')
        const loader = showDashboardLoader(target)

        expect(target.contains(loader)).toBe(true)
        expect(document.body.querySelector('#' + DASHBOARD_LOADER_ID)).toBeNull()
    })

    it('returns the existing loader instead of duplicating it', () => {
        const first = showDashboardLoader()
        const second = showDashboardLoader()

        expect(second).toBe(first)
        expect(document.body.querySelectorAll('#' + DASHBOARD_LOADER_ID)).toHaveLength(1)
    })

    it('does not duplicate when a loader already exists in a custom target', () => {
        const target = document.createElement('div')
        const first = showDashboardLoader(target)
        const second = showDashboardLoader(target)

        expect(second).toBe(first)
        expect(target.querySelectorAll('#' + DASHBOARD_LOADER_ID)).toHaveLength(1)
    })
})

describe('removeDashboardLoader', () => {
    it('removes the loader from the DOM', () => {
        showDashboardLoader()

        expect(document.body.querySelector('#' + DASHBOARD_LOADER_ID)).not.toBeNull()

        removeDashboardLoader()

        expect(document.body.querySelector('#' + DASHBOARD_LOADER_ID)).toBeNull()
    })

    it('is a no-op when no loader is present', () => {
        expect(() => removeDashboardLoader()).not.toThrow()
    })
})
