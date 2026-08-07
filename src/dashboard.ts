/**
 * Redline dashboard — entry point.
 *
 * A standalone Vue SPA (Reports + Users) served under /{redline.path}. The
 * dashboard is embedded as a native custom element, `<redline-dashboard>`, whose
 * kebab-case attributes carry the host-provided transport/placement config:
 *
 *   <redline-dashboard
 *     api="..." dashboard="/redline" theme="dark"
 *     csrf="redline_csrf"
 *   ></redline-dashboard>
 *
 * Capability flags (features, guest mode, auth provider settings, mail status)
 * are fetched at mount from the public `GET /redline/api/bootstrap` and folded
 * onto the runtime config; the SPA boots only after that resolves (the element
 * content stays empty until then — acceptable for an SPA root).
 *
 * `RedlineDashboardElement` reads the attributes and boots a `RedlineDashboard`
 * instance (Vue + Pinia + vue-router + Nuxt UI + TanStack Query) directly onto
 * the element. The dashboard keeps its global stylesheet link and
 * createWebHistory routing — no shadow DOM, no constructor/ready handshake, no
 * explicit window global.
 */
import '../css/redline-dashboard.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import { VueQueryPlugin } from '@tanstack/vue-query'

import { ApiClient } from '@/core/api/client'
import { BearerTransport, CookieTransport, type AuthTransport } from '@/core/api/auth-transport'
import { applyBootstrap, fetchBootstrap } from '@/core/bootstrap'
import { makeApi, type Api } from '@/resources/api'
import { applyDashboardFavicon } from '@/core/favicon'
import { identity } from '@/core/storage'
import { vueQueryOptions } from '@/core/api/query-client'
import { useDashboardStore } from '@/store/dashboard'
import type { AuthField } from '@/resources/user/model'

import DashboardApp from '@/components/dashboard/Dashboard.vue'
import ResetPasswordView from '@/components/dashboard/ResetPassword.vue'
import Home from '@/components/dashboard/pages/Home.vue'
import Reports from '@/components/dashboard/pages/Reports.vue'
import Users from '@/components/dashboard/pages/Users.vue'

export interface DashboardConfig {
    url: string
    base: string
    features: string[]
    requiresApproval: boolean
    mailConfigured: boolean
    fields: AuthField[]
    theme: string
    el: string | HTMLElement
    surface: 'widget' | 'dashboard'
    canLogin: boolean
    canRegister: boolean
    csrfCookie: string
}

class RedlineDashboard {
    config: DashboardConfig
    api: Api
    #client: ApiClient
    #transport: AuthTransport

    constructor(config: Partial<DashboardConfig> = {}) {
        this.config = {
            url: config.url ?? location.origin + '/redline/api',
            base: config.base ?? '/redline',
            features: config.features ?? [],
            requiresApproval: config.requiresApproval ?? false,
            mailConfigured: config.mailConfigured ?? false,
            fields: config.fields ?? [],
            theme: config.theme ?? 'dark',
            el: config.el ?? '#redline-dashboard',
            surface: config.surface ?? 'dashboard',
            canLogin: config.canLogin ?? true,
            canRegister: config.canRegister ?? false,
            csrfCookie: config.csrfCookie ?? 'redline_csrf',
        }

        // Same-origin → cookie auth (HttpOnly redline_token + redline_csrf header);
        // cross-origin/cloud → Bearer token from the identity facade.
        const sameOrigin = new URL(this.config.url, location.href).origin === location.origin
        this.#transport = sameOrigin
            ? new CookieTransport(this.config.csrfCookie)
            : new BearerTransport(() => identity.getToken())

        this.#client = new ApiClient(this.config.url, this.#transport)
        this.api = makeApi(this.#client)
    }

    /**
     * Fetch the public bootstrap payload, fold it onto the runtime config (and
     * point the CSRF transport at the real cookie name), then boot the SPA.
     * Bootstrap never throws — it fails closed to the config defaults
     * (features: [], canRegister: false, mailConfigured: false, ...).
     */
    async init(): Promise<void> {
        const bootstrap = await fetchBootstrap(this.#client)
        if (bootstrap) {
            applyBootstrap(this.config as unknown as Record<string, unknown>, bootstrap)
            if (this.#transport instanceof CookieTransport) {
                this.#transport.setCsrfName(bootstrap.csrf.cookie)
                this.#transport.setHeaderName(bootstrap.csrf.header)
            }
        }
        this.#bootstrap()
    }

    #bootstrap() {
        const router = createRouter({
            history: createWebHistory(this.config.base),
            routes: [
                { path: '/', name: 'home', component: Home },
                { path: '/reports', name: 'reports', component: Reports },
                { path: '/users', name: 'users', component: Users },
                { path: '/reset-password', name: 'reset-password', component: ResetPasswordView, meta: { standalone: true } },
            ],
        })

        const app = createApp(DashboardApp)
        app.use(createPinia())
        app.use(router)
        app.use(ui)
        app.use(VueQueryPlugin, vueQueryOptions())
        app.provide('redline', this)

        // Create the store within the app context so its inject('redline') resolves,
        // then provide it for shared components' useStore() = inject('store').
        const store = app.runWithContext(() => useDashboardStore())
        app.provide('store', store)

        // Set the tab favicon (decorated host icon, cached) while the SPA boots —
        // fire-and-forget, never blocks or affects mount.
        applyDashboardFavicon()

        app.mount(this.config.el)
    }
}

// ── Custom element wrapper ────────────────────────────────────────────────────────
// A deliberately thin bootstrap: read kebab-case attributes, let the
// RedlineDashboard constructor defaults fill in the missing ones, and mount the
// SPA directly onto this element (app.mount accepts an Element — no child div).

class RedlineDashboardElement extends HTMLElement {
    private _bootstrapped = false

    connectedCallback() {
        if (this._bootstrapped) return
        this._bootstrapped = true

        // Apply the theme class early so the page doesn't flash light before
        // Dashboard.vue toggles document.documentElement.classList on mount.
        const theme = this.getAttribute('theme')
        if (theme) document.documentElement.classList.toggle('dark', theme === 'dark')

        // Only present attributes are forwarded; absent ones are left unset so
        // the RedlineDashboard constructor's own defaults apply. Note `el` and
        // `surface` are NOT attributes — `el` is set to `this` directly because
        // DashboardConfig.el accepts `string | HTMLElement`, and `surface`
        // stays 'dashboard'.
        const has = (name: string) => this.hasAttribute(name)
        const get = (name: string) => this.getAttribute(name) ?? ''

        const config: Partial<DashboardConfig> = {
            el: this,
            surface: 'dashboard',
        }
        if (has('api')) config.url = get('api')
        if (has('dashboard')) config.base = get('dashboard')
        if (has('csrf')) config.csrfCookie = get('csrf')
        if (has('theme')) config.theme = get('theme')

        void new RedlineDashboard(config).init()
    }
}

if (!customElements.get('redline-dashboard')) {
    customElements.define('redline-dashboard', RedlineDashboardElement)
}

export default RedlineDashboard
