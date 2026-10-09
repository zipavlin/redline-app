import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the dark-on-dark UCalendar inside the widget.
 *
 * Nuxt UI's theme layer defines the `--ui-text` token but never the `color`
 * property, so the widget's shadow surface used to inherit `color` from the host
 * page across the shadow boundary; UCalendar's unselected day cells, which set no
 * text utility of their own, then painted the host's dark text on our dark popover
 * surface (black on black on a light host page). The fix binds the surface colour
 * to the token in the shared base stylesheet.
 *
 * happy-dom runs no Tailwind/Nuxt UI cascade and cannot resolve `--ui-*` custom
 * properties, so a getComputedStyle assertion would be a fake signal. The honest,
 * deterministic guard is the stylesheet source - it fails the moment the binding
 * is dropped, which is the only way this regression can come back.
 */
describe('base stylesheet surface colour', () => {
    const baseCss = readFileSync(resolve(process.cwd(), 'css/_base.css'), 'utf8')

    it('binds both the widget surface and the dashboard body to the theme text token', () => {
        expect(baseCss).toMatch(/\[data-redline-root\][^{]*\bbody\b[^{]*\{[^}]*color:\s*var\(--ui-text\)/)
    })
})
