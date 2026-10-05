<script setup lang="ts">
import { computed } from 'vue'
import {
    STATUSES,
    type Status,
    type StatusColor,
    allowedStatusTargets,
    statusActionColor,
    statusActionIconFor,
    statusActionLabel,
} from '@/domain/status'
import { ROLES, type Role } from '@/domain/role'

const props = withDefaults(defineProps<{
    status?: string
    role?: string | null
    loading?: boolean
    authorized?: boolean
}>(), {
    loading: false,
    role: null,
    authorized: true,
})

const emit = defineEmits<{
    change: [status: string]
}>()

// State
const popoverOpen = defineModel<boolean>('open', { default: false })
const lifecycleOrder = STATUSES as readonly string[]

// Computed
/**
 * Role comes from the callsite (widget/dashboard), not from either app store -
 * the component is shared, so it must not read a store to learn the role.
 */
const allowedTargets = computed(() => {
    // `role` alone is not the product gate: the changer renders only for author/developer.
    if (!props.authorized || !props.status || !props.role || !(ROLES as readonly string[]).includes(props.role)) {
        return []
    }
    return allowedStatusTargets(props.status, props.role as Role)
})

const nextStatus = computed<string | null>(() => {
    const targets = allowedTargets.value
    if (!targets.length || !props.status) {
        return null
    }

    const currentIdx = lifecycleOrder.indexOf(props.status)

    // Prefer forward targets (index > current), pick closest
    const forward = targets
        .filter(t => lifecycleOrder.indexOf(t) > currentIdx)
        .sort((a, b) => lifecycleOrder.indexOf(a) - lifecycleOrder.indexOf(b))
    if (forward.length) {
        return forward[0]
    }

    // Fall back to backward targets (re-open), pick closest
    const backward = targets
        .filter(t => lifecycleOrder.indexOf(t) < currentIdx)
        .sort((a, b) => lifecycleOrder.indexOf(b) - lifecycleOrder.indexOf(a))
    if (backward.length) {
        return backward[0]
    }
    return null
})

const dropdownTargets = computed(() =>
    allowedTargets.value.filter(t => t !== nextStatus.value),
)

const nextLabel = computed(() =>
    nextStatus.value && props.status
        ? statusActionLabel(props.status as Status, nextStatus.value as Status)
        : null,
)

const nextColor = computed<StatusColor>(() =>
    nextStatus.value && props.status
        ? statusActionColor(props.status as Status, nextStatus.value as Status)
        : 'success',
)

const nextIcon = computed(() =>
    nextStatus.value && props.status
        ? statusActionIconFor(props.status as Status, nextStatus.value as Status)
        : null,
)

/** Dropdown rows resolve label/color/icon against the CURRENT status (the from side). */
const dropdownActions = computed(() => {
    if (!props.status) return []
    const from = props.status as Status
    return dropdownTargets.value.map(to => ({
        status: to,
        label: statusActionLabel(from, to as Status),
        color: statusActionColor(from, to as Status),
        icon: statusActionIconFor(from, to as Status),
    }))
})

const hasDropdown = computed(() => dropdownTargets.value.length > 0)

function select(status: string) {
    popoverOpen.value = false
    emit('change', status)
}
</script>

<template>
    <UFieldGroup v-if="allowedTargets.length">
        <UButton
            v-if="nextStatus"
            :color="nextColor"
            variant="subtle"
            :label="nextLabel ?? undefined"
            :icon="nextIcon ?? undefined"
            :loading="loading"
            @click="select(nextStatus as string)"
        />
        <UPopover v-if="hasDropdown" v-model:open="popoverOpen" :content="{ side: 'bottom', align: 'end' }" arrow>
            <UButton
                :color="nextColor"
                variant="outline"
                icon="i-lucide-chevron-down"
                :loading="loading"
            />
            <template #content>
                <div class="flex flex-col p-1 gap-1">
                    <UButton
                        v-for="action in dropdownActions"
                        :key="action.status"
                        :color="action.color"
                        variant="ghost"
                        :label="action.label"
                        :icon="action.icon"
                        size="sm"
                        class="justify-start"
                        @click="select(action.status)"
                    />
                </div>
            </template>
        </UPopover>
    </UFieldGroup>
</template>
