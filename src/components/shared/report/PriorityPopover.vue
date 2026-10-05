<script setup lang="ts">
/**
 * Compact priority control for the widget create flows. A footer-styled popover
 * trigger showing the current priority; picking an option updates the model and
 * closes only this popover, never the surrounding reporting modal.
 * Presentational: the parent owns the value and threads it into the payload.
 */
import { computed } from 'vue'
import { PRIORITIES, priorityColor, priorityLabel, type Priority } from '@/domain/priority'

const model = defineModel<Priority>({ default: 'normal' })

// State
const popoverOpen = defineModel<boolean>('open', { default: false })

// Computed
const triggerColor = computed(() => priorityColor(model.value))

// Functions
function select(priority: Priority) {
    popoverOpen.value = false
    if (priority === model.value) return
    model.value = priority
}
</script>

<template>
    <UPopover
        v-model:open="popoverOpen"
        :content="{ side: 'top', align: 'start' }"
        arrow
    >
        <UTooltip :text="`Priority: ${model}`" arrow>
            <UButton
                :color="triggerColor"
                :variant="['high', 'critical'].includes(model) ? 'subtle' : 'ghost'"
                size="sm"
                square
                icon="i-lucide-flag"
                :aria-label="`Priority: ${model}`"
            />
        </UTooltip>
        <template #content>
            <div class="flex flex-col p-1 gap-1">
                <UButton
                    v-for="option in PRIORITIES"
                    :key="option"
                    :color="priorityColor(option)"
                    :variant="option === model ? 'soft' : 'ghost'"
                    :label="priorityLabel(option)"
                    size="sm"
                    class="justify-start"
                    @click="select(option)"
                />
            </div>
        </template>
    </UPopover>
</template>
