/**
 * Redline widget - entry point.
 *
 * The widget is a Vue Custom Element rendered into a Shadow DOM, so it is fully
 * isolated from the host page (no Tailwind prefix, no style bleed either way).
 *
 * Embed:
 *   <script src="/redline.js"></script>
 *   <redline-widget
 *     api="https://your-app.test/redline/api"
 *     dashboard="https://your-app.test/redline"
 *     csrf="redline_csrf"
 *     theme="dark"
 *     position="bottom-right"
 *   ></redline-widget>
 *
 * Attributes carry only transport/placement config (api/dashboard/csrf/theme/
 * position/expanded); capability flags (features, guest mode, auth provider
 * settings, mail status) are fetched at mount from `GET /redline/api/bootstrap`
 * and fail closed if unreachable. There is no `new Redline({...})` constructor
 * and no `redline:ready` handshake anymore.
 */
import { defineCustomElement } from 'vue'
import { createPinia } from 'pinia'
import ui from '@nuxt/ui/vue-plugin'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { routeLocationKey, type RouteLocationNormalizedLoaded } from 'vue-router'

import { vueQueryOptions } from '@/core/api/query-client'
import Widget from '@/components/widget/Widget.ce.vue'

/**
 * Compiled Tailwind + Nuxt UI stylesheet as a string, injected into the shadow
 * root by prepending it to the component's styles (component <style> still wins).
 */
import css from '../css/redline.css?inline'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Widget as any).styles = [css, ...((Widget as { styles?: string[] }).styles || [])]

const RedlineElement = defineCustomElement(Widget, {
    configureApp(app) {
        // Dev-only shim: vite.config enables Nuxt UI's vue-router override in dev for the
        // dashboard, and that override applies to the router-less widget too. Its ULink
        // calls useRoute() (inject(routeLocationKey)) unconditionally, so with no route
        // provided every UButton warns "injection 'route location' not found". Provide the
        // same stub Nuxt UI uses without a router (stubs/none.js). Guarded by MODE, which is
        // "development" under dev/dev:build-widget and "production" under build, so the
        // vue-router import tree-shakes out of the production widget bundle.
        if (import.meta.env.MODE === 'development') {
            app.provide(routeLocationKey, {
                fullPath: '/',
                path: '/',
                name: null,
                params: {},
                query: {},
                hash: '',
                meta: {},
                matched: [],
                redirectedFrom: undefined,
            } as unknown as RouteLocationNormalizedLoaded)
        }

        app.use(createPinia())
        app.use(ui)
        app.use(VueQueryPlugin, vueQueryOptions())
    },
})

if (!customElements.get('redline-widget')) {
    customElements.define('redline-widget', RedlineElement)
}
