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
        app.use(createPinia())
        app.use(ui)
        app.use(VueQueryPlugin, vueQueryOptions())
    },
})

if (!customElements.get('redline-widget')) {
    customElements.define('redline-widget', RedlineElement)
}
