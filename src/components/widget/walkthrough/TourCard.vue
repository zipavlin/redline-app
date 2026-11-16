<script setup lang="ts">
/**
 * Coach-mark card - lives inside the toolbar's own fixed column, so it inherits
 * whichever corner the toolbar sits in without measuring anything. Escape is
 * arbitrated by ToolbarMenu (see its defineShortcuts handler), not here.
 */
import { computed, inject } from 'vue'
import type { WalkthroughControls } from '@/composables/useWalkthrough'

const tour = inject<WalkthroughControls | null>('walkthrough', null)

const isLast = computed(() => !!tour && tour.index >= tour.steps.length - 1)
</script>

<template>
    <div
        v-if="tour && tour.active && tour.step"
        data-component="walkthrough-card"
        aria-live="polite"
        class="rounded-xl border border-default bg-default p-3 shadow-lg"
    >
        <p class="text-xs text-dimmed">{{ tour.index + 1 }} of {{ tour.steps.length }}</p>
        <p class="mt-1 text-sm font-semibold text-default">{{ tour.step.title }}</p>
        <p class="mt-1 text-xs text-muted">{{ tour.step.body }}</p>
        <div class="mt-3 flex items-center justify-end gap-1">
            <UButton size="xs" color="neutral" variant="ghost" label="Skip" @click="tour.finish()" />
            <UButton size="xs" variant="solid" :label="isLast ? 'Done' : 'Next'" @click="tour.next()" />
        </div>
    </div>
</template>
