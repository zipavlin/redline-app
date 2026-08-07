import type { ApiResult } from '@/core/api/types'
import type { ListParams } from '@/core/api/params'
import type { AuthTransport } from '@/core/api/auth-transport'

export interface RequestOptions {
    body?: unknown
    isFormData?: boolean
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/**
 * Serialize grammar params into a query string. Uses append() so duplicate
 * keys (e.g. multiple include[] entries) are preserved. Values can be a
 * string or string[]; arrays produce repeated keys.
 */
export function buildQuery(params: ListParams = {}): string {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
        if (v === null || v === undefined) continue
        // aggregate[] keys: empty value is a valid signal for grouped-count mode
        // (backend interprets key presence without value as "count all distinct values of
        // this column"), unlike other param groups where '' means the param is absent.
        if (v === '' && !k.startsWith('aggregate[')) continue
        if (Array.isArray(v)) {
            for (const item of v) {
                if (item !== '') q.append(k, item)
            }
        } else {
            q.append(k, String(v))
        }
    }
    const s = q.toString()
    return s ? `?${s}` : ''
}

/**
 * Low-level fetch wrapper.
 * - Applies the injected auth transport: cookie (credentials + X-Redline-CSRF on
 *   non-GET) for same-origin, Bearer (Authorization header) for cloud.
 * - Returns { ok, status, data }
 */
export class ApiClient {
    #baseUrl: string
    #transport: AuthTransport

    constructor(baseUrl: string, transport: AuthTransport) {
        this.#baseUrl = baseUrl.replace(/\/$/, '')
        this.#transport = transport
    }

    async request<T = unknown>(method: Method, path: string, { body, isFormData = false }: RequestOptions = {}): Promise<ApiResult<T>> {
        const url = `${this.#baseUrl}/${path}`
        const headers: Record<string, string> = { Accept: 'application/json' }

        if (!isFormData && body != null) {
            headers['Content-Type'] = 'application/json'
        }

        const init: RequestInit = {
            method,
            headers,
            body: isFormData ? (body as BodyInit) : (body != null ? JSON.stringify(body) : undefined),
        }

        this.#transport.apply(init, headers)

        const response = await fetch(url, init)

        const data = (await response.json().catch(() => null)) as T
        return { ok: response.ok, status: response.status, data }
    }

    get<T = unknown>(path: string): Promise<ApiResult<T>> {
        return this.request<T>('GET', path)
    }
    post<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>): Promise<ApiResult<T>> {
        return this.request<T>('POST', path, { body, ...opts })
    }
    patch<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
        return this.request<T>('PATCH', path, { body })
    }
    delete<T = unknown>(path: string): Promise<ApiResult<T>> {
        return this.request<T>('DELETE', path)
    }
}
