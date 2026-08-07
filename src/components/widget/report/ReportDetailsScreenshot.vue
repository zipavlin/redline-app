<script setup lang="ts">
import type { SelectedReport } from '@/store/widget/selection'

defineProps<{ report: SelectedReport }>()
</script>

<template>
    <div v-if="report.screenshot" class="relative w-full group border border-default rounded-lg">
        <img class="w-full rounded-lg block" :src="report.screenshot.url" alt="Screenshot" />
        <UButton
            :to="report.screenshot.url"
            target="_blank"
            size="xs" square color="neutral" variant="solid"
            icon="i-lucide-square-arrow-out-up-right"
            aria-label="Open screenshot"
            class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        />
    </div>
</template>
