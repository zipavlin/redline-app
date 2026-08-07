/**
 * Custom dashboard favicon.
 *
 * Discovers the host app's favicon (the best <link rel="icon"> from the host root
 * page, else /favicon.ico), decorates it with Redline brand elements (the red
 * squiggle + corner dot from components/shared/ui/Logo.vue) on a 32×32 offscreen
 * canvas, caches the resulting PNG data URL in localStorage (indefinitely — no
 * TTL), and applies it via a <link rel="icon"> in the page head.
 *
 * Lives in core/ (browser I/O). Every path fails silently: nothing is ever thrown
 * to the caller and nothing is logged. If decoration fails (CORS/tainted canvas,
 * no canvas support, image load failure), the ORIGINAL host icon URL is linked
 * undecorated; if no host icon can be discovered at all, the page is left
 * untouched.
 */
const CACHE_KEY = 'redline_favicon'
const RED = '#EF4444'
const CANVAS = 32

// Host icon frame: top-left (4,4), 24×24, 3px corner radius
const IMAGE = { x: 4, y: 4, size: 24, radius: 3 }

/** Host icon source: absolute URL + whether it is cross-origin to the dashboard. */
interface HostIcon {
    url: string
    crossOrigin: boolean
}

/**
 * Public entry — fire-and-forget. Runs the cached-check → discovery → decoration
 * → cache → apply a chain without blocking the caller or ever throwing.
 */
export function applyDashboardFavicon(): void {
    void run()
}

async function run(): Promise<void> {
    try {
        const cached = readCache()
        if (cached) {
            applyLink(cached)
            return
        }

        const source = await discoverHostIcon()
        if (!source) return

        const decorated = await decorateIcon(source)
        if (decorated) {
            writeCache(decorated)
            applyLink(decorated)
        } else {
            applyLink(source.url)
        }
    } catch {
        // Every failure path is silent by design.
    }
}

// ── localStorage (guarded: private-mode Safari throws) ────────────────────────

function readCache(): string | null {
    try {
        const value = localStorage.getItem(CACHE_KEY)
        return value && value.length > 0 ? value : null
    } catch {
        return null
    }
}

function writeCache(value: string): void {
    try {
        localStorage.setItem(CACHE_KEY, value)
    } catch {
        // Favicon is already applied — just not cached.
    }
}

// ── Discovery ─────────────────────────────────────────────────────────────────

async function discoverHostIcon(): Promise<HostIcon | null> {
    // Root page first: Laravel ships a default /favicon.ico (the Laravel logo)
    // that must NOT be used when the host page declares a real icon link.
    const root = await pickFromRootPage()
    if (root) return { url: root, crossOrigin: isCrossOrigin(root) }

    const ico = await probeFaviconIco()
    if (ico) return { url: ico, crossOrigin: isCrossOrigin(ico) }

    return null
}

/** Probes /favicon.ico: HEAD first, GET fallback if HEAD fails. */
async function probeFaviconIco(): Promise<string | null> {
    const url = new URL('/favicon.ico', document.baseURI).href
    if (await looksLikeImage(url, { method: 'HEAD' })) return url
    if (await looksLikeImage(url, { method: 'GET' })) return url
    return null
}

async function looksLikeImage(url: string, init: RequestInit): Promise<boolean> {
    let res: Response | null = null
    try {
        res = await fetch(url, init)
    } catch {
        res = null
    }
    if (!res || !res.ok) return false
    return (res.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')
}

interface IconCandidate {
    href: string      // absolute URL, resolved against document.baseURI
    isSvg: boolean    // SVG type or .svg href
    sizesAny: boolean // sizes="any"
    size: number      // largest declared WxH product (0 when undeclared)
    isIcon: boolean   // plain rel~="icon" (not apple-touch-icon)
}

/** Fetches the host root page and picks the best <link rel="icon"> candidate. */
async function pickFromRootPage(): Promise<string | null> {
    const url = new URL('/', document.baseURI).href
    let html: string
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        html = await res.text()
    } catch {
        return null
    }

    const doc = new DOMParser().parseFromString(html, 'text/html')
    const candidates: IconCandidate[] = []
    for (const link of Array.from(doc.querySelectorAll('link[rel]'))) {
        const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
        const isIcon = rel.includes('icon')
        const isApple = rel.includes('apple-touch-icon')
        if (!isIcon && !isApple) continue

        const rawHref = link.getAttribute('href')
        if (!rawHref) continue

        let href: string
        try {
            href = new URL(rawHref, document.baseURI).href
        } catch {
            continue
        }

        const sizes = (link.getAttribute('sizes') ?? '').toLowerCase()
        const sizesAny = sizes === 'any'
        let size = 0
        for (const token of sizes.split(/\s+/)) {
            const match = token.match(/^(\d+)\s*x\s*(\d+)$/)
            if (match) size = Math.max(size, Number(match[1]) * Number(match[2]))
        }

        const type = (link.getAttribute('type') ?? '').toLowerCase()
        const isSvg = type.includes('svg') || href.toLowerCase().split('?')[0].endsWith('.svg')

        candidates.push({ href, isSvg, sizesAny, size, isIcon })
    }

    return pickBest(candidates)?.href ?? null
}

/**
 * Ranks candidates: plain rel="icon" links first — SVG / sizes="any" win outright,
 * otherwise the largest declared WxH size. apple-touch-icon candidates are only
 * considered when no plain icon link exists (the same ranking within that set).
 */
function pickBest(candidates: IconCandidate[]): IconCandidate | null {
    const rank = (list: IconCandidate[]): IconCandidate | null => {
        const untyped = list.filter((c) => c.isSvg || c.sizesAny)
        if (untyped.length) return untyped.reduce((a, b) => (b.size > a.size ? b : a))
        const sized = list.filter((c) => c.size > 0).sort((a, b) => b.size - a.size)
        if (sized.length) return sized[0]
        // Bare icon link with no sizes/type declared — still a valid candidate
        // (e.g. a classic <link rel="icon" href="/favicon.ico">).
        return list[0] ?? null
    }

    return rank(candidates.filter((c) => c.isIcon)) ?? rank(candidates.filter((c) => !c.isIcon))
}

function isCrossOrigin(url: string): boolean {
    try {
        return new URL(url).origin !== new URL(document.baseURI).origin
    } catch {
        return false
    }
}

// ── Decoration ────────────────────────────────────────────────────────────────

function loadImage(url: string, withCrossOrigin: boolean): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.decoding = 'async'
        if (withCrossOrigin) img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('icon load failed'))
        img.src = url
    })
}

/**
 * Decoration failures (no 2d context, image load failure, tainted canvas making
 * toDataURL throw) return null so the caller falls back to the raw host URL.
 */
async function decorateIcon(source: HostIcon): Promise<string | null> {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS
    canvas.height = CANVAS
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    let img: HTMLImageElement
    try {
        img = await loadImage(source.url, source.crossOrigin)
    } catch {
        if (!source.crossOrigin) return null
        // Retry WITHOUT crossOrigin: the canvas will be tainted, so toDataURL will
        // throw below and the caller links the raw icon URL — but at least the
        // icon itself can still be shown.
        try {
            img = await loadImage(source.url, false)
        } catch {
            return null
        }
    }

    try {
        draw(ctx, img)
        return canvas.toDataURL('image/png')
    } catch {
        return null
    }
}

function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
    // Icon clipped to the inner rounded rect so the ring stays a uniform 2px.
    ctx.save()
    roundedRect(ctx, IMAGE.x, IMAGE.y, IMAGE.size, IMAGE.size, IMAGE.radius)
    ctx.clip()
    ctx.drawImage(img, IMAGE.x, IMAGE.y, IMAGE.size, IMAGE.size)
    ctx.restore()

    // Brand squiggle (mirrors components/shared/ui/Logo.vue), hugging the bottom:
    // icon bottom edge is y=25; the wave baseline sits at y≈28.8 (wave top ≈25.8
    // clears the icon, wave bottom ≈31.8 just inside the canvas edge).
    ctx.strokeStyle = RED
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    squiggle(ctx, CANVAS / 2, 28.8, 26)

    // Brand corner dot — 8×8 badge at the top-right; may overlap the icon's
    // corner, which is the intended badge style.
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(29, 3, 3, 0, 2 * Math.PI)
    ctx.fill()
}

/**
 * Traces a rounded rect path. Uses ctx.roundRect when available (newer browsers),
 * otherwise falls back to arcTo segments.
 */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r)
        return
    }
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
}

/**
 * Draws the Redline brand squiggle, mirroring components/shared/ui/Logo.vue: a
 * two-bump cubic wave. Normalized logo geometry (viewBox 52×53): the wave runs
 * x∈[3.742,48.742] (45 units) around a y=48 baseline with ±4 amplitude; each of
 * the four cubic segments spans 11.25 x-units with control points offset +3.75 x
 * and ∓4 y. Scaled here to `width` centered on (cx, baseY).
 */
function squiggle(ctx: CanvasRenderingContext2D, cx: number, baseY: number, width: number): void {
    const scale = width / 45
    const amp = 4 * scale
    const seg = 11.25 * scale
    const cp = 3.75 * scale

    const x0 = cx - width / 2
    ctx.beginPath()
    ctx.moveTo(x0, baseY)
    ctx.bezierCurveTo(x0 + cp, baseY - amp, x0 + seg - cp, baseY - amp, x0 + seg, baseY)
    ctx.bezierCurveTo(x0 + seg + cp, baseY + amp, x0 + 2 * seg - cp, baseY + amp, x0 + 2 * seg, baseY)
    ctx.bezierCurveTo(x0 + 2 * seg + cp, baseY - amp, x0 + 3 * seg - cp, baseY - amp, x0 + 3 * seg, baseY)
    ctx.bezierCurveTo(x0 + 3 * seg + cp, baseY + amp, x0 + 4 * seg - cp, baseY + amp, x0 + 4 * seg, baseY)
    ctx.stroke()
}

// ── Applying the link ─────────────────────────────────────────────────────────

function applyLink(href: string): void {
    const head = document.head
    let link = head.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        head.appendChild(link)
    }
    // data: URLs must be announced as image/png; any other href drops the type so
    // a pre-existing link never keeps a stale image/png from an earlier data: URL.
    if (href.startsWith('data:')) link.type = 'image/png'
    else link.removeAttribute('type')
    link.href = href
}
