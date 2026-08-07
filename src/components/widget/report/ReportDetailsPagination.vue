<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import type { SelectedReport } from '@/store/widget/selection'

const props = defineProps<{ report: SelectedReport }>()
const emit = defineEmits<{ navigate: [report: SelectedReport] }>()

const store = useStore<WidgetStore>()

const currentIndex = computed(() => store.report.list.findIndex((r: SelectedReport) => r.id === props.report.id))
const prevReport = computed(() => (currentIndex.value > 0 ? store.report.list[currentIndex.value - 1] : null))
const nextReport = computed(() =>
    currentIndex.value < store.report.list.length - 1 ? store.report.list[currentIndex.value + 1] : null,
)

onMounted(() => { store.sortReports('_pageY') })
</script>

<template>
    <div class="flex items-center justify-between">
        <UButton
            size="sm"
            variant="soft"
            icon="i-lucide-chevron-left"
            aria-label="Previous report"
            :disabled="!prevReport"
            @click="prevReport && emit('navigate', prevReport)"
        />
        <span class="text-sm text-muted tabular-nums">{{ currentIndex + 1 }} / {{ store.report.list.length }}</span>
        <UButton
            size="sm"
            variant="soft"
            icon="i-lucide-chevron-right"
            aria-label="Next report"
            :disabled="!nextReport"
            @click="nextReport && emit('navigate', nextReport)"
        />
    </div>
</template>
