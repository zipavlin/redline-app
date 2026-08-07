/**
 * Resolve the active store provided by the current app root. The widget
 * provides `useWidgetStore()`, the dashboard `useDashboardStore()`; shared
 * components can read the store through this composable without knowing which
 * app they run in.
 *
 * Hybrid typed design: shared components rely on the default `SharedStore`
 * contract (the minimal surface they need - auth + session activation);
 * app-specific components call `useStore<WidgetStore>()` /
 * `useStore<DashboardStore>()` for the concrete store shape.
 *
 * The contract is declared here (client-owned) rather than imported from a
 * store module, so composables/ stays below store/ in the dependency layering.
 */
import { inject } from 'vue'

/** The auth user surface used by cross-app components. */
export interface SharedStoreUser {
    id: string
    name: string
    email: string
    role: string
    [key: string]: unknown
}

export interface SharedStoreAuth {
    user: SharedStoreUser | null
    callback: (() => void) | null
    authView: 'login' | 'register'
}

/**
 * Minimal contract both app stores satisfy. `activateSession` is declared as a
 * method (not an arrow property) so parameter assignability stays bivariant -
 * the concrete stores accept the narrower `AuthUser`. The token is optional:
 * local cookie mode never returns one from auth responses, so it may be absent.
 */
export interface SharedStore {
    auth: SharedStoreAuth
    activateSession(user: SharedStoreUser, token?: string, options?: { rememberMe?: boolean }): void
}

export function useStore<TStore extends SharedStore = SharedStore>(): TStore {
    const store = inject<TStore>('store')
    if (!store) {
        throw new Error('[redline] No store provided. The app root must call app.provide("store", useXStore()).')
    }
    return store
}
