<script setup lang="ts">
/**
 * Widget root - the Vue Custom Element rendered into the `<redline-widget>` shadow root.
 *
 * Responsibilities:
 *  - Read transport/placement config from element attributes/props, build the API
 *    namespace + context, and provide `redline` + `store` at the app level (so the
 *    Pinia store's inject('redline') and shared components' useStore() resolve).
 *  - Fetch the public `GET /redline/api/bootstrap` at mount and fold it onto the
 *    runtime config (features/guest/auth/mail/csrf). The whole tree is gated on
 *    `ready`, so the widget fails closed (renders nothing) until bootstrap resolves.
 *  - Create the in-shadow portal target for Nuxt UI overlays and wrap the tree in
 *    <UApp :portal>, so modals/popovers/tooltips/drawers/toasts render *styled*
 *    inside the shadow root.
 *  - Drive the in-shadow wrapper's `.dark` class from the widget's own theme setting,
 *    keeping dark mode scoped to the shadow root without touching the host <html>.
 */
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue'

import { ApiClient } from '@/core/api/client'
import { BearerTransport, CookieTransport } from '@/core/api/auth-transport'
import { applyBootstrap, fetchBootstrap, type BootstrapRuntimeConfig } from '@/core/bootstrap'
import { makeApi } from '@/resources/api'
import { identity } from '@/core/storage'
import { canCapture } from '@/core/browser'
import { useWidgetStore } from '@/store/widget'
import { useModeManager } from '@/composables/useModeManager'
import type { RedlineContext } from '@/composables/useApi'

import Toolbar from '@/components/widget/toolbar/Toolbar.vue'
import GuestToolbar from '@/components/widget/toolbar/GuestToolbar.vue'
import PinOverlay from '@/components/widget/pin/PinOverlay.vue'
import PinLayer from '@/components/widget/pin/PinLayer.vue'
import ReportModal from '@/components/widget/report/Report.vue'
import AuthLogin from '@/components/shared/auth/AuthLogin.vue'
import CreateReport from '@/components/widget/create/CreateReport.vue'
import CreateAnnotation from '@/components/widget/create/CreateAnnotation.vue'
import CreateVideo from '@/components/widget/create/CreateVideo.vue'
import ConfirmDialog from '@/components/shared/ui/ConfirmDialog.vue'
import { defineShortcuts } from '@nuxt/ui/composables/defineShortcuts'

// State
// Config (element attributes / DOM properties)
/**
 * Only transport/placement config arrives via attributes; capability flags
 * (features, guest mode, auth provider settings, mail status) come from bootstrap.
 */
const props = withDefaults(defineProps<{
    api?: string
    dashboard?: string
    csrf?: string
    theme?: string
    position?: string
    expanded?: boolean | string
}>(), {
    theme: 'dark',
    position: 'bottom-right',
    csrf: 'redline_csrf',
})

// Build the Redline context + store, provide at app level
const app = getCurrentInstance()!.appContext.app

const baseUrl = props.api ?? location.origin + '/redline/api'

/**
 * Same-origin → cookie auth (HttpOnly redline_token + redline_csrf header);
 * cross-origin/cloud → Bearer token from the identity facade.
 */
const sameOrigin = new URL(baseUrl, location.href).origin === location.origin

const config = reactive<BootstrapRuntimeConfig>({
    url: baseUrl,
    dashboard: props.dashboard ?? location.origin + '/redline',
    guest: false,
    theme: props.theme,
    position: props.position,
    expanded: parseBool(props.expanded),
    features: [],
    fields: [],
    surface: 'widget',
    canLogin: true,
    canRegister: false,
    canSelectRole: false,
    requiresApproval: false,
    mailConfigured: false,
    csrfCookie: props.csrf ?? 'redline_csrf',
    loginMode: 'credentials',
    cookieTransport: sameOrigin,
})

const transport = sameOrigin
    ? new CookieTransport(config.csrfCookie)
    : new BearerTransport(() => identity.getToken())

const client = new ApiClient(baseUrl, transport)

const redline: RedlineContext = {
    api: makeApi(client),
    config,
}
app.provide('redline', redline)

const store = app.runWithContext(() => useWidgetStore())
app.provide('store', store)

// Bootstrap: fetch capability flags, then render
/**
 * The tree is gated on `ready` so the widget renders only after bootstrap
 * resolves (or fails closed to its defaults). fetchBootstrap never throws, and
 * the CSRF transport is pointed at the real cookie name once known.
 */
const ready = ref(false)
void fetchBootstrap(client).then(bootstrap => {
    if (bootstrap) {
        applyBootstrap(config, bootstrap)
        if (transport instanceof CookieTransport) {
            transport.setCsrfName(bootstrap.csrf.cookie)
            transport.setHeaderName(bootstrap.csrf.header)
        }
    }
    ready.value = true
})

// Shadow-root portal target for Nuxt UI overlays
/**
 * Created imperatively (not a template ref) so it is a real element from the very
 * first render - UApp/Toaster resolve their teleport target immediately instead of
 * getting `undefined` (which makes reka's toast portal read `.ce` off null). It is
 * appended inside the dark-mirroring wrapper on mount so overlays stay styled + themed.
 */
const rootRef = ref<HTMLElement>()
const portalEl = document.createElement('div')
portalEl.setAttribute('data-redline-portal', '')

// Capture-overlay elements (shadow DOM breaks getElementById, so pass refs)
const pinOverlay = ref<InstanceType<typeof PinOverlay>>()
const { activatePin, activateAnnotation, activateVideo, exitCurrentMode, destroy, pausePinHighlight, resumePinHighlight } =
    useModeManager(() => {
        const o = pinOverlay.value
        if (!o?.overlayEl || !o.highlightEl) return null
        return { overlay: o.overlayEl, highlight: o.highlightEl, touchConfirm: o.touchConfirmEl ?? null }
    })

/**
 * Expose the mode controls to descendants (toolbar) so they don't need the
 * overlay resolver themselves.
 */
provide('modeManager', { activatePin, activateAnnotation, activateVideo, exitCurrentMode })

// Computed
// Color mode: drive the in-shadow wrapper's `.dark` class from our own theme
/**
 * The widget owns its theme (the `theme` attribute → store.settings.theme) and keeps
 * it scoped to the shadow root. Nuxt UI's color-mode plugin (which toggles `.dark` on
 * the host <html>) is disabled for the widget build (see vite.config `colorMode`), so
 * we neither pollute nor depend on the host document's class.
 */
const isDark = computed(() => store.settings.theme === 'dark')
const isAuthed = computed(() => !!store.auth.user)

/**
 * Toasts appear opposite the toolbar's vertical edge so they never sit under it
 * (toolbar bottom-* → toasts top-*, and vice versa), keeping the same horizontal side.
 */
const toasterPosition = computed(() => {
    const [vertical, horizontal] = store.settings.position.split('-')
    return `${vertical === 'top' ? 'bottom' : 'top'}-${horizontal}` as
        'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
})

// Watchers
/**
 * The tree is gated on `ready`, so the portal element can only be appended once the
 * root div has actually rendered (rootRef is undefined before that).
 */
watch(ready, async value => {
    if (!value) return
    await nextTick()
    if (!portalEl.parentElement && rootRef.value) rootRef.value.appendChild(portalEl)
})

watch(() => store.report.pending, (pending: unknown) => {
    if (pending) pausePinHighlight()
    else resumePinHighlight()
})

// Functions
function parseBool(value: boolean | string | undefined): boolean {
    return value === true || value === '' || value === 'true'
}

function _onResize() {
    store.browser.viewport.width = window.innerWidth
    store.browser.viewport.height = window.innerHeight
}

onMounted(() => {
    store.capabilities.capture = canCapture()

    window.addEventListener('resize', _onResize)

    // Keyboard shortcuts (Alt+C pin, Alt+V video, Alt+S annotation, Escape exits).
    defineShortcuts({
        alt_c: () => { store.mode === 'pin' ? exitCurrentMode() : activatePin() },
        alt_v: () => { store.mode === 'video' ? exitCurrentMode() : activateVideo() },
        alt_s: () => { store.mode === 'annotation' ? exitCurrentMode() : activateAnnotation() },
        escape: {
            usingInput: false,
            handler: () => {
                if (store.report.pending) {
                    store.report.pending = null
                    resumePinHighlight()
                } else if (store.mode !== null && store.mode !== 'annotation') {
                    exitCurrentMode()
                }
            },
        },
    })
})

onUnmounted(() => {
    window.removeEventListener('resize', _onResize)
    destroy()
})
</script>

<template>
    <div v-if="ready" ref="rootRef" data-redline-root :class="{ dark: isDark }">
        <UApp :portal="portalEl" :toaster="{ position: toasterPosition }">
            <Toolbar v-if="isAuthed" />
            <GuestToolbar v-else />

            <PinOverlay ref="pinOverlay" />

            <div data-redline-markers>
                <PinLayer />
            </div>

            <ReportModal />
            <AuthLogin />
            <CreateReport />
            <CreateAnnotation />
            <CreateVideo />
            <ConfirmDialog />
        </UApp>
    </div>
</template>
