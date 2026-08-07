<script setup lang="ts">
import type { SelectedReport } from '@/store/widget/selection'

const props = defineProps<{ report: SelectedReport }>()
const b = props.report.browser
</script>

<template>
    <div class="flex flex-col gap-1 px-1">
        <div class="flex items-center justify-between text-sm">
            <span class="text-muted font-mono">Browser</span>
            <span class="text-default">{{ b?.name ?? '—' }} {{ b?.version ?? '' }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
            <span class="text-muted font-mono">Viewport</span>
            <span class="text-default">{{ b?.viewport_width ?? '—' }} × {{ b?.viewport_height ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
            <span class="text-muted font-mono">Pixel ratio</span>
            <span class="text-default">{{ b?.device_pixel_ratio ?? '—' }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
            <span class="text-muted font-mono">OS</span>
            <span class="text-default">{{ b?.os ?? '—' }}</span>
        </div>
    </div>
</template>
