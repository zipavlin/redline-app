/**
 * Walkthrough state - the widget provides one instance beside `modeManager`.
 * The step list is derived from the live store, so the tour follows the toolbar
 * and the create-report composer instead of holding a list that goes stale.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { walkthroughSteps, type WalkthroughStep, type WalkthroughTarget } from '@/domain/walkthrough'

export interface WalkthroughControls {
    active: boolean
    index: number
    steps: WalkthroughStep[]
    step: WalkthroughStep | null
    /** Ring target - null unless the tour is running, so a hidden card can never light a button. */
    highlight: WalkthroughTarget | null
    start: () => void
    next: () => void
    prev: () => void
    finish: () => void
    stop: () => void
}

export function useWalkthrough(): WalkthroughControls {
    const store = useStore<WidgetStore>()

    const active = ref(false)
    const index = ref(0)
    // Step 1 needs the expanded toolbar; the user's own preference is restored on exit.
    let expandedBefore = false

    const steps = computed(() =>
        walkthroughSteps({
            authenticated: !!store.auth.user,
            guest: store.auth.user?.role === 'guest',
            expanded: store.settings.expanded,
            reportOpen: !!store.report.pending,
        }),
    )
    const step = computed(() => steps.value[Math.min(index.value, steps.value.length - 1)] ?? null)
    const highlight = computed<WalkthroughTarget | null>(() => (active.value ? (step.value?.target ?? null) : null))

    function start() {
        if (active.value) {
            index.value = 0
            return
        }
        expandedBefore = store.settings.expanded
        store.settings.expanded = true
        index.value = 0
        active.value = true
    }

    function next() {
        if (index.value >= steps.value.length - 1) {
            finish()
            return
        }
        index.value++
    }

    function prev() {
        if (index.value > 0) index.value--
    }

    function stop() {
        // Idempotent: Escape and the menu both route here, and a stray call must not
        // collapse a toolbar the user expanded themselves.
        if (!active.value) return
        active.value = false
        index.value = 0
        store.settings.expanded = expandedBefore
    }

    /** Done / Skip - the same teardown, named for the user-facing exit. */
    function finish() {
        stop()
    }

    // A capture covers the surface the card points at; pin mode is how the pin step is carried out.
    watch([() => store.capturing, () => store.mode], ([capturing, mode]) => {
        if (!active.value) return
        if (capturing || (mode !== null && mode !== 'pin')) stop()
    })

    // Submitting the draft closes the panel and shortens the list; the tour has no step left to show.
    watch(() => steps.value.length, length => {
        if (active.value && length > 0 && index.value > length - 1) finish()
    })

    // Collapsing the toolbar removes every target button; that click wins over the pre-tour value.
    watch(steps, list => {
        if (!active.value || list.length > 0 || !store.auth.user) return
        expandedBefore = store.settings.expanded
        stop()
    })

    // Logging out removes the toolbar the tour points at - it must not survive into the next login.
    watch(() => store.auth.user, user => {
        if (active.value && !user) stop()
    })

    return reactive({ active, index, steps, step, highlight, start, next, prev, finish, stop })
}
