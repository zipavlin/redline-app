/**
 * Access the injected Redline context (API namespace + config).
 * Both bootstraps `app.provide('redline', instance)` where the instance exposes
 * `api` (the typed namespace from makeApi) and `config`.
 */
import { inject } from 'vue'
import type { Api } from '@/resources/api'

export interface RedlineContext {
    api: Api
    config: Record<string, unknown>
}

export const REDLINE_KEY = 'redline'

export function useRedline(): RedlineContext {
    const redline = inject<RedlineContext>(REDLINE_KEY)
    if (!redline) {
        throw new Error('[redline] context not provided — app.provide("redline", instance) is missing')
    }
    return redline
}

export function useApi(): Api {
    return useRedline().api
}
