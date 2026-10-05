<script setup lang="ts">
/**
 * Report priority tag - the single priority display/edit control.
 *
 * Always renders a badge (including `normal`) so priority is visible to
 * everybody; when `editable` the badge doubles as a popover trigger offering
 * the four priorities. The callsite decides who may change priority (developer/
 * admin or the report author) - this component carries no role or lifecycle
 * logic.
 */
import { computed } from 'vue'
import {PRIORITIES, priorityColor, priorityLabel, type Priority, priorityIcon} from '@/domain/priority'

const props = withDefaults(defineProps<{
    priority?: string
    editable?: boolean
    loading?: boolean
}>(), {
    editable: false,
    loading: false,
})

const emit = defineEmits<{
    change: [priority: string]
}>()

// State
const popoverOpen = defineModel<boolean>('open', { default: false })

// Computed
const current = computed<Priority | null>(() =>
    props.priority && (PRIORITIES as readonly string[]).includes(props.priority)
        ? props.priority as Priority
        : null,
)
const badgeColor = computed(() => (current.value ? priorityColor(current.value) : 'neutral'))
const badgeLabel = computed(() => (current.value ? priorityLabel(current.value) : props.priority ?? ''))
const badgeIcon = computed(() => (current.value ? priorityIcon(current.value) : null))

// Functions
function select(priority: Priority) {
    popoverOpen.value = false
    if (priority === props.priority) return
    emit('change', priority)
}
</script>

<template>
    <UPopover
        v-if="editable"
        v-model:open="popoverOpen"
        :content="{ side: 'bottom', align: 'end' }"
        arrow
    >
        <UBadge
            as="button"
            type="button"
            :color="badgeColor"
            variant="subtle"
            size="sm"
            :icon="badgeIcon"
            :label="badgeLabel"
            :aria-label="`Priority: ${badgeLabel}`"
            :disabled="loading || undefined"
            :class="['cursor-pointer', loading ? 'opacity-60' : undefined]"
        />
        <template #content>
            <div class="flex flex-col p-1 gap-1">
                <UButton
                    v-for="option in PRIORITIES"
                    :key="option"
                    :color="priorityColor(option)"
                    :variant="option === current ? 'soft' : 'ghost'"
                    :label="priorityLabel(option)"
                    size="sm"
                    class="justify-start"
                    @click="select(option)"
                />
            </div>
        </template>
    </UPopover>

    <UBadge
        v-else
        :color="badgeColor"
        variant="subtle"
        size="sm"
        :label="badgeLabel"
    />
</template>
