<script setup lang="ts">
import { computed } from 'vue'
import { STATUSES, type Status, allowedStatusTargets, statusAction, statusActionIcon } from '@/domain/status'
import { ROLES, type Role } from '@/domain/role'

const props = withDefaults(defineProps<{
    status?: string
    role?: string | null
    loading?: boolean
}>(), {
    loading: false,
    role: null,
})

const emit = defineEmits<{
    change: [status: string]
}>()

// Role comes from the callsite (widget/dashboard), not from either app store —
// the component is shared, so it must not read a store to learn the role.
const allowedTargets = computed(() => {
    if (!props.status || !props.role || !(ROLES as readonly string[]).includes(props.role)) {
        return []
    }
    return allowedStatusTargets(props.status, props.role as Role)
})

const popoverOpen = defineModel<boolean>('open', { default: false })

const lifecycleOrder = STATUSES as readonly string[]

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
    nextStatus.value ? statusAction(nextStatus.value as Status) : null,
)

const nextIcon = computed(() =>
    nextStatus.value ? statusActionIcon(nextStatus.value as Status) : null,
)

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
            color="success"
            variant="subtle"
            :label="nextLabel ?? undefined"
            :icon="nextIcon ?? undefined"
            :loading="loading"
            @click="select(nextStatus as string)"
        />
        <UPopover v-if="hasDropdown" v-model:open="popoverOpen" :content="{ side: 'bottom', align: 'end' }" arrow>
            <UButton
                color="success"
                variant="outline"
                icon="i-lucide-chevron-down"
                :loading="loading"
            />
            <template #content>
                <div class="flex flex-col p-1 gap-1">
                    <UButton
                        v-for="status in dropdownTargets"
                        :key="status"
                        color="neutral"
                        variant="ghost"
                        :label="statusAction(status as Status)"
                        :icon="statusActionIcon(status as Status)"
                        size="sm"
                        class="justify-start"
                        @click="select(status)"
                    />
                </div>
            </template>
        </UPopover>
    </UFieldGroup>
</template>
