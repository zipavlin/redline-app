<script setup lang="ts">
import { watch } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { getPinCoordinates } from '@/core/pin'
import PinMarker from '@/components/widget/pin/PinMarker.vue'
import type { SelectedReport } from '@/store/widget/selection'

const store = useStore<WidgetStore>()

// Recompute pin page coordinates whenever the viewport changes.
watch(
    () => ({ w: store.browser.viewport.width, h: store.browser.viewport.height }),
    () => {
        store.report.list = store.report.list.map((r: SelectedReport) => {
            const coords = getPinCoordinates(r)
            return coords ? { ...r, _pageX: coords.pageX, _pageY: coords.pageY } : r
        })
    },
)
</script>

<template>
    <div
        v-show="store.mode !== 'annotation' && store.mode !== 'video'"
        data-component="pin-layer"
        style="position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:10"
    >
        <PinMarker
            v-for="(report, i) in (store.report.list as SelectedReport[])"
            :key="report.id"
            :report="report"
            :index="i"
            :passive="store.mode === 'pin'"
        />
    </div>
</template>
