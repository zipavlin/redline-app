/**
 * Public bootstrap fetch — replaces server-injected capability attributes.
 *
 * The host no longer injects `features`/`fields`/`guest`/`can-register`/
 * `mail-configured`/`requires-approval`/`csrf-cookie` attributes onto
 * `<redline-widget>` / `<redline-dashboard>`. Instead the frontend fetches the
 * public read-only `GET /redline/api/bootstrap` (path `bootstrap` relative to
 * the API client's baseUrl) at mount and folds the nested wire shape onto the
 * flat runtime config keys the stores/components already consume.
 *
 * Fail-closed contract: on ANY failure (non-ok result, network rejection, or a
 * malformed body) the runtime keys keep their fail-closed defaults —
 * `features: []`, `guest: false`, `canLogin: true`, `canRegister: false`,
 * `mailConfigured: false`, `fields: []`, and the CSRF name from the element's
 * attribute hint — so the widget/dashboard degrade to the least privileged
 * behavior (login stays enabled for local auth providers, matching
 * `AuthProvider::canLogin()` base behavior).
 */
import type { ApiClient } from '@/core/api/client'

/** Provider-specific registration field descriptor (structural; index-signature). */
export interface BootstrapField {
    name: string
    type: string
    label?: string
    placeholder?: string
    [key: string]: unknown
}

/** Wire shape of `GET /redline/api/bootstrap`. */
export interface BootstrapResponse {
    version: number
    features: string[]
    capabilities: {
        guest_reporting: boolean
        auth: {
            can_login: boolean
            can_register: boolean
            fields: BootstrapField[]
            can_select_role: boolean
            requires_approval: boolean
            requires_email_verification: boolean
        }
        mail: { configured: boolean }
    }
    csrf: { cookie: string; header: string }
}

/** Fail-closed runtime keys `applyBootstrap` produces, as the flat config. */
export interface BootstrapRuntimeConfig {
    features: string[]
    guest: boolean
    canLogin: boolean
    canRegister: boolean
    requiresApproval: boolean
    mailConfigured: boolean
    fields: BootstrapField[]
    csrfCookie: string
    [key: string]: unknown
}

/**
 * Fetch the public bootstrap payload. Returns `null` on ANY failure — a non-ok
 * result, a network rejection, or a malformed body (`data` missing, `features`
 * not an array, or `capabilities`/`csrf` missing). Never throws.
 */
export async function fetchBootstrap(client: Pick<ApiClient, 'get'>): Promise<BootstrapResponse | null> {
    try {
        const result = await client.get<BootstrapResponse>('bootstrap')
        if (!result.ok) return null

        const data = result.data
        if (!data || typeof data !== 'object' || !Array.isArray(data.features) || !data.capabilities || !data.csrf) {
            return null
        }

        return data
    } catch {
        return null
    }
}

/**
 * Fold the nested bootstrap wire shape onto the flat runtime config keys, in
 * place. Only the eight known keys are touched; everything else (transport,
 * placement, surface) is left as-is.
 */
export function applyBootstrap(config: Record<string, unknown>, bootstrap: BootstrapResponse): void {
    config.features = bootstrap.features
    config.guest = bootstrap.capabilities.guest_reporting
    config.canLogin = bootstrap.capabilities.auth.can_login
    config.canRegister = bootstrap.capabilities.auth.can_register
    config.requiresApproval = bootstrap.capabilities.auth.requires_approval
    config.mailConfigured = bootstrap.capabilities.mail.configured
    config.fields = bootstrap.capabilities.auth.fields
    config.csrfCookie = bootstrap.csrf.cookie
}
