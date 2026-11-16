<script setup lang="ts">
/**
 * First-run prompt - asks once per user, and answers both ways mark the flag seen.
 * Rendered by the widget root, which only exists after auth is known.
 */
import { computed, inject, ref } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import type { WalkthroughControls } from '@/composables/useWalkthrough'

const store = useStore<WidgetStore>()
const tour = inject<WalkthroughControls | null>('walkthrough', null)
const answered = ref(false)

/**
 * Only an explicit `false` asks: a user restored from the local cache carries no
 * flag, so the prompt waits for the server's user row instead of guessing.
 */
const open = computed({
    get: () =>
        !answered.value &&
        !!store.auth.user &&
        store.auth.user.role !== 'guest' &&
        store.auth.user.walkthrough_seen === false &&
        store.feature('walkthrough'),
    set: (value: boolean) => {
        if (!value) answer(false)
    },
})

function answer(showTour: boolean) {
    answered.value = true
    // A failed PATCH only leaves the flag false for the next mount; never ask twice per session.
    void store.markWalkthroughSeen()
    if (showTour) tour?.start()
}
</script>

<template>
    <UModal
        v-model:open="open"
        :dismissible="false"
        title="Do you want a short walkthrough?"
        data-component="walkthrough-prompt"
        :ui="{ overlay: 'z-[70]', content: 'z-[70]' }"
    >
        <template #body>
            <p class="text-sm text-muted">A few short steps will highlight and explain the controls you will use most.</p>
        </template>
        <template #footer>
            <UButton variant="soft" @click="answer(false)">Not now</UButton>
            <UButton color="primary" variant="solid" @click="answer(true)">Show me</UButton>
        </template>
    </UModal>
</template>
