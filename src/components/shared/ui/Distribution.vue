<script setup lang="ts">
/**
 * A horizontal category-distribution bar with an optional legend - styled after
 * nuxtcharts' category distribution. Replaces the old SegmentBar.
 *
 * `segments[].color` is a Tailwind background utility (e.g. `bg-error`), so it
 * works for both the bar fill and the legend dot. Zero-count segments are hidden.
 */
import { computed } from 'vue'

export interface DistributionSegment {
    key: string | number
    label: string
    count?: number
    /** Tailwind bg utility, e.g. `bg-error`, `bg-success/50`. */
    color: string
}

const props = withDefaults(defineProps<{
    segments: DistributionSegment[]
    legend?: boolean
    showCounts?: boolean
    interactive?: boolean
    activeKey?: string | number | null
}>(), {
    legend: false,
    showCounts: true,
    interactive: false,
    activeKey: null,
})

const emit = defineEmits<{ select: [key: string | number] }>()

const total = computed(() => props.segments.reduce((sum, s) => sum + (s.count ?? 0), 0))

const visible = computed(() =>
    props.segments
        .map(s => ({
            ...s,
            count: s.count ?? 0,
            pct: total.value ? ((s.count ?? 0) / total.value) * 100 : 0,
        }))
        .filter(s => s.count > 0),
)

function onSelect(key: string | number) {
    if (props.interactive) emit('select', key)
}
</script>

<template>
    <div class="flex flex-col gap-2">
        <!-- Stacked bar -->
        <div class="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-elevated">
            <UTooltip v-for="seg in visible" :key="seg.key" :text="`${seg.label}: ${seg.count}`">
                <div
                    class="h-full rounded-full transition-opacity first:rounded-l-full last:rounded-r-full"
                    :class="[seg.color, {
                        'cursor-pointer': interactive,
                        'opacity-40': activeKey != null && activeKey !== seg.key,
                    }]"
                    :style="{ width: seg.pct + '%' }"
                    @click="onSelect(seg.key)"
                />
            </UTooltip>
        </div>

        <!-- Legend -->
        <div v-if="legend" class="flex flex-wrap gap-x-3 gap-y-1">
            <button
                v-for="seg in visible"
                :key="seg.key"
                type="button"
                class="inline-flex items-center gap-1.5 text-xs transition-opacity"
                :class="[
                    interactive ? 'cursor-pointer hover:text-default' : 'cursor-default',
                    (activeKey != null && activeKey === seg.key) ? 'text-default' : 'text-muted',
                    { 'opacity-40': activeKey != null && activeKey !== seg.key },
                ]"
                :disabled="!interactive"
                @click="onSelect(seg.key)"
            >
                <span class="inline-block size-2 rounded-full" :class="seg.color" />
                <span>{{ seg.label }}<template v-if="showCounts">: {{ seg.count }}</template></span>
            </button>
        </div>
    </div>
</template>
