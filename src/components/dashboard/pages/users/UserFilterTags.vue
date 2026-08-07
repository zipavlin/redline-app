<script setup lang="ts">
/**
 * Removable chips for the active user filters (everything beyond the status
 * tabs + search). Currently just a role chip; a trailing "Clear all" resets
 * every extra filter.
 */
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'

const store = useStore<DashboardStore>()

const roleLabel = (role: string): string => ({
    admin: 'Admin',
    developer: 'Developer',
    reporter: 'Reporter',
}[role] ?? role)
</script>

<template>
    <div v-if="store.users.filter.role" class="flex flex-wrap items-center gap-1.5">
        <UBadge color="neutral" variant="subtle" class="gap-1">
            Role: {{ roleLabel(store.users.filter.role) }}
            <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="link"
                size="xs"
                :padded="false"
                class="p-0"
                aria-label="Remove filter"
                @click="store.users.filter.role = null"
            />
        </UBadge>

        <UButton variant="link" color="neutral" size="xs" label="Clear all" @click="store.users.filter.role = null" />
    </div>
</template>
