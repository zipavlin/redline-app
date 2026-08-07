// Page-URL helpers. Browser I/O (reads window.location), so core/, not domain/.

// Removes redline's own query params (redline-report, redline-filter, …).
function stripRedlineParams(params: URLSearchParams): URLSearchParams {
    for (const key of [...params.keys()]) {
        if (key.startsWith('redline-')) params.delete(key)
    }
    return params
}

// Analytics / ad-click params that never define page content — dropped from the grouping key
// so campaign & share links don't fragment a page into many report groups.
const TRACKING_PARAMS = new Set([
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'yclid', 'dclid',
    'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'igshid', 'mkt_tok', '_openstat',
])

function isTrackingParam(key: string): boolean {
    return key.startsWith('utm_') || TRACKING_PARAMS.has(key)
}

// Full page URL for storing/reopening a report: keeps content query params, drops redline's
// own params and the hash.
export function getCleanUrl(): string {
    const qs = stripRedlineParams(new URLSearchParams(location.search)).toString()
    return location.origin + location.pathname + (qs ? '?' + qs : '')
}

// Normalized grouping key: pathname + content-defining query params only. Drops redline and
// tracking params and sorts the rest so param order doesn't split one page into many groups.
export function getUrlKey(): string {
    const params = stripRedlineParams(new URLSearchParams(location.search))
    for (const key of [...params.keys()]) {
        if (isTrackingParam(key)) params.delete(key)
    }
    params.sort()
    const qs = params.toString()
    return location.pathname + (qs ? '?' + qs : '')
}
