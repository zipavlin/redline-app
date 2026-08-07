/**
 * Auth transport abstraction — keeps the API client backend-agnostic.
 *
 * Local same-origin auth is cookie-based: the session JWT lives in an HttpOnly
 * `redline_token` cookie (JS can never read it) and the server mirrors a
 * non-HttpOnly `redline_csrf` cookie that must be echoed back as the
 * `X-Redline-CSRF` header on state-changing requests.
 *
 * Future cloud/cross-origin auth uses `Authorization: Bearer` with a token
 * injected by the caller (never stored in a cookie).
 */

/** Reads a cookie value from document.cookie, or null when unreadable/absent. */
function readCookie(name: string): string | null {
    try {
        // Escape regex metacharacters so custom cookie names are matched literally.
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'))
        return match ? decodeURIComponent(match[1]) : null
    } catch {
        // document.cookie can throw in sandboxed iframes — treat as unreadable.
        return null
    }
}

export interface AuthTransport {
    isCookieBased: boolean
    apply(init: RequestInit, headers: Record<string, string>): void
}

/**
 * Same-origin, cookie-authenticated transport. Sends credentials and, for
 * non-GET requests, echoes the CSRF cookie (default `redline_csrf`) as the
 * CSRF header (default X-Redline-CSRF). Both names start from the constructor
 * hint and can be updated via `setCsrfName`/`setHeaderName` once the bootstrap
 * payload reveals the real ones.
 */
export class CookieTransport implements AuthTransport {
    readonly isCookieBased = true
    #csrfName: string
    #headerName = 'X-Redline-CSRF'

    constructor(csrfName = 'redline_csrf') {
        this.#csrfName = csrfName
    }

    apply(init: RequestInit, headers: Record<string, string>): void {
        init.credentials = 'same-origin'
        const method = init.method?.toUpperCase() ?? 'GET'
        if (method === 'GET') return
        const csrf = readCookie(this.#csrfName)
        if (csrf) headers[this.#headerName] = csrf
    }

    /** Update the CSRF cookie name (e.g. from the bootstrap payload). */
    setCsrfName(name: string): void {
        this.#csrfName = name
    }

    /** Update the CSRF header name (e.g. from the bootstrap payload). */
    setHeaderName(name: string): void {
        this.#headerName = name
    }
}

/**
 * Cross-origin / cloud transport. Never sends cookies; attaches an
 * `Authorization: Bearer` header when the injected token is present.
 */
export class BearerTransport implements AuthTransport {
    readonly isCookieBased = false

    constructor(private readonly getToken: () => string | null) {}

    apply(init: RequestInit, headers: Record<string, string>): void {
        init.credentials = 'omit'
        const token = this.getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
    }
}
