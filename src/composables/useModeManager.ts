/**
 * Mode manager — orchestrates the widget's capture modes (pin/annotation/video).
 *
 * PinCapture needs the capture-overlay DOM nodes. In the Shadow DOM they can't be
 * found with document.getElementById, so the root passes a `resolveOverlay` getter
 * that returns the PinOverlay component's exposed elements.
 */
import { inject, markRaw } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { ElementCapture } from '@/core/capture/element'
import type { RedlineContext } from '@/composables/useApi'
import { useToast } from '@nuxt/ui/composables/useToast'

interface OverlayEls {
    overlay: HTMLElement
    highlight: HTMLElement
    touchConfirm: HTMLElement | null
}

let _elementCapture: ElementCapture | null = null

export function useModeManager(resolveOverlay: () => OverlayEls | null) {
    const store = useStore<WidgetStore>()
    const redline = inject<RedlineContext>('redline') as RedlineContext
    const toast = useToast()

    async function activatePin() {
        if (!_ensureAuth(activatePin)) return
        if (store.mode === 'pin') {
            _exitPin()
            return
        }
        exitCurrentMode()

        const els = resolveOverlay()
        if (!els) return
        store.mode = 'pin'

        _elementCapture = new ElementCapture(els.overlay, els.highlight, els.touchConfirm)
        _elementCapture.onPinPlaced = async (pinData: { pin: { x: number; y: number }; element: Element | null }) => {
            store.report.pending = {
                pin: pinData.pin,
                element: pinData.element ? markRaw(pinData.element) : null,
            }
            await store.loadReports()
        }
        _elementCapture.enter()
        await store.loadReports('all')
    }

    function activateAnnotation() {
        if (!_ensureAuth(activateAnnotation)) return
        if (store.mode === 'annotation') {
            exitCurrentMode()
            return
        }
        exitCurrentMode()
        store.mode = 'annotation'
    }

    function activateVideo() {
        if (!_ensureAuth(activateVideo)) return
        if (!store.capabilities.capture) {
            toast.add({
                title: window.isSecureContext
                    ? "Your browser doesn't support screen capture"
                    : 'Screen capture requires a secure connection (HTTPS)',
                color: 'error',
            })
            return
        }
        exitCurrentMode()
        store.mode = 'video'
    }

    function exitCurrentMode() {
        if (store.mode === 'pin') {
            _exitPin()
        } else if (store.mode !== null) {
            store.mode = null
            store.report.pending = null
        }
    }

    function destroy() {
        _elementCapture?.destroy()
        _elementCapture = null
    }

    function pausePinHighlight() { _elementCapture?.pauseHighlight() }
    function resumePinHighlight() { _elementCapture?.resumeHighlight() }

    // Returns true if authenticated (or guest mode). Otherwise stores the callback
    // to retry after login and returns false.
    function _ensureAuth(callback: () => void): boolean {
        if (store.auth.user || redline.config.guest) return true
        store.auth.callback = callback ?? (() => {})
        return false
    }

    function _exitPin() {
        _elementCapture?.exit()
        _elementCapture = null
        store.mode = null
        store.report.pending = null
    }

    return { activatePin, activateAnnotation, activateVideo, exitCurrentMode, destroy, pausePinHighlight, resumePinHighlight }
}

/** Mode controls provided by the widget root and injected by the toolbar. */
export interface ModeControls {
    activatePin: () => void
    activateAnnotation: () => void
    activateVideo: () => void
    exitCurrentMode: () => void
}
