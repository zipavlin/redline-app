<script setup lang="ts">
/**
 * Reusable hand-rolled SVG donut — no chart library. One ring per nonzero
 * segment (rounded caps, segment color from STATUS_META), total in the center,
 * 2-column legend underneath. Zero-count segments are hidden; when there is
 * nothing at all a single dashed ring + "No reports yet" empty state shows.
 *
 * Dashboard-only; the widget bundle must tree-shake this out.
 */
import { computed } from 'vue'
import type { DonutSegment } from '@/resources/report/home'

const props = withDefaults(defineProps<{
    segments: DonutSegment[]
    centerLabel?: string
}>(), {
    centerLabel: 'reports',
})

const SIZE = 160
const STROKE = 18
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const total = computed(() => props.segments.reduce((sum, s) => sum + s.count, 0))

// One circle per segment: stroke-dasharray shows a single arc of the segment's
// length, stroke-dashoffset shifts its start to the cumulative position. The
// group is rotated -90deg so the first segment starts at 12 o'clock.
const arcs = computed(() => {
    if (total.value === 0) return []
    let acc = 0

    return props.segments.map((segment) => {
        const len = (segment.count / total.value) * CIRCUMFERENCE
        const arc = { ...segment, dash: `${len} ${CIRCUMFERENCE - len}`, offset: -acc }
        acc += len

        return arc
    })
})
</script>

<template>
    <div class="flex flex-col items-center gap-4">
        <div class="relative size-40">
            <svg
                :viewBox="`0 0 ${SIZE} ${SIZE}`"
                class="size-full"
                role="img"
                :aria-label="`${total} reports`"
            >
                <g transform="rotate(-90 80 80)">
                    <template v-if="arcs.length">
                        <g
                            v-for="arc in arcs"
                            :key="arc.status"
                        >
                            <circle
                                :cx="SIZE / 2"
                                :cy="SIZE / 2"
                                :r="RADIUS"
                                fill="none"
                                :class="[arc.strokeClass]"
                                :stroke-width="STROKE"
                                stroke-linecap="round"
                                :stroke-dasharray="arc.dash"
                                :stroke-dashoffset="arc.offset"
                                class="transition-[stroke-width] duration-150"
                            />
                        </g>
                    </template>

                    <circle
                        v-else
                        :cx="SIZE / 2"
                        :cy="SIZE / 2"
                        :r="RADIUS"
                        fill="none"
                        stroke="currentColor"
                        class="text-muted"
                        stroke-width="2"
                        stroke-dasharray="4 6"
                    />
                </g>
            </svg>

            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <template v-if="total > 0">
                    <span class="text-3xl font-bold tabular-nums text-highlighted">{{ total }}</span>
                    <span class="text-xs text-muted">{{ centerLabel }}</span>
                </template>
                <template v-else>
                    <UIcon name="i-lucide-inbox" class="size-5 text-dimmed" />
                    <span class="mt-1 text-sm text-muted">No reports yet</span>
                </template>
            </div>
        </div>

        <div v-if="arcs.length" class="flex w-full justify-between gap-x-4 gap-y-1.5">
            <div v-for="segment in arcs" class="flex cursor-default items-center justify-start">
                <span class="size-2 shrink-0 rounded-sm mr-2" :class="segment.barClass" />
                <span class="text-sm text-muted">{{ segment.label }}: {{ segment.count }}</span>
            </div>
        </div>
    </div>
</template>
