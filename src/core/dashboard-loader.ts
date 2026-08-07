/**
 * Dashboard startup loader.
 *
 * A pure-DOM bootstrap shown inside `<redline-dashboard>` while the SPA boots
 * (fetchBootstrap → applyBootstrap → mount). The Laravel Blade shell may ship
 * static loader markup with the same id inside the element; showDashboardLoader
 * is idempotent and reuses it rather than duplicating, and removeDashboardLoader
 * drops it right before the SPA mounts (see #bootstrap in dashboard.ts).
 *
 * This module touches only the DOM - no Vue, no innerHTML, no I/O. The wave
 * geometry is the Logo.vue baseline: a gray track + a primary sweep that draws
 * left-to-right on a loop (CSS handles the dash array/offset; reduced-motion
 * users get the static filled wave).
 */
export const DASHBOARD_LOADER_ID = 'redline-dashboard-loader'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Logo.vue wave path - shared verbatim by the track and the sweep. */
const WAVE_PATH =
    'M3.742 48C7.492 44 11.242 44 14.992 48C18.742 52 22.492 52 26.242 48C29.992 44 33.742 44 37.492 48C41.242 52 44.992 52 48.742 48'

/**
 * Build the loader element tree (not yet inserted anywhere):
 *
 *   <div id="redline-dashboard-loader" role="status" aria-live="polite">
 *     <div class="redline-loader">
 *       <svg viewBox="0 0 52 53" width="48" height="48" fill="none" aria-hidden="true">…
 *       <p>Redline dashboard is loading</p>
 *     </div>
 *   </div>
 */
export function createDashboardLoader(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.id = DASHBOARD_LOADER_ID
    wrap.setAttribute('role', 'status')
    wrap.setAttribute('aria-live', 'polite')

    const box = document.createElement('div')
    box.className = 'redline-loader'

    /**
     * SVG elements must live in the SVG namespace to render in browsers - a
     * plain document.createElement('svg') produces an HTML-namespaced element
     * whose children browsers refuse to paint.
     */
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 52 53')
    svg.setAttribute('width', '48')
    svg.setAttribute('height', '48')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('aria-hidden', 'true')
    svg.append(
        makeWavePath('redline-loader-track'),
        makeWavePath('redline-loader-sweep'),
    )

    const label = document.createElement('p')
    label.textContent = 'Redline dashboard is loading'

    box.append(svg, label)
    wrap.append(box)
    return wrap
}

/**
 * Insert the loader into `target` (defaults to document.body) and return it.
 * Idempotent: if a loader with DASHBOARD_LOADER_ID already exists inside the
 * target (e.g. static markup shipped by the Blade shell), it is returned as-is
 * and no duplicate is created.
 */
export function showDashboardLoader(target?: HTMLElement): HTMLElement {
    const host = target ?? document.body
    const existing = host.querySelector('#' + DASHBOARD_LOADER_ID)
    if (existing) return existing as HTMLElement

    const loader = createDashboardLoader()
    host.append(loader)
    return loader
}

/** Remove the loader from the DOM if present. No-op otherwise. */
export function removeDashboardLoader(): void {
    document.getElementById(DASHBOARD_LOADER_ID)?.remove()
}

/** A Logo.vue wave path element with the shared stroke style. */
function makeWavePath(className: string): SVGPathElement {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', WAVE_PATH)
    path.setAttribute('class', className)
    path.setAttribute('stroke-width', '3')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    return path
}
