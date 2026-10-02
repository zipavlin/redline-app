<script setup lang="ts">
/**
 * Presentational Trello-style member picker: search, the current report members
 * with per-row remove, and the candidates as click-to-add rows. Knows nothing
 * about the API - parents own data and mutations.
 */
import { computed, ref } from 'vue'
import type { Member } from '@/resources/report/model'

const props = defineProps<{
    members: Member[]
    candidates: Member[]
    canEdit: boolean
    loading?: boolean
}>()

const emit = defineEmits<{
    add: [member: Member]
    remove: [member: Member]
}>()

// State
const query = ref('')

// Computed
const filteredMembers = computed(() => filterByName(props.members))
const filteredCandidates = computed(() => filterByName(props.candidates))
const isEmpty = computed(() => !filteredMembers.value.length && !(props.canEdit && filteredCandidates.value.length))

// Functions
function filterByName(members: Member[]): Member[] {
    const needle = query.value.trim().toLowerCase()
    if (!needle) return members
    return members.filter(member => member.name.toLowerCase().includes(needle))
}
</script>

<template>
    <div class="flex w-72 flex-col">
        <div class="flex items-center justify-between gap-2 px-2 pt-2">
            <p class="text-sm font-semibold text-highlighted">
                Members
            </p>
            <slot name="close" />
        </div>

        <div class="p-2 pt-1.5">
            <UInput
                v-model="query"
                icon="i-lucide-search"
                placeholder="Search members…"
                class="w-full"
                autofocus
            />
        </div>

        <div class="max-h-80 overflow-y-auto px-1 pb-1">
            <template v-if="filteredMembers.length">
                <p class="px-2 py-1 text-xs font-medium text-muted">
                    Report members
                </p>
                <UButton
                    v-for="member in filteredMembers"
                    :key="member.id"
                    color="neutral"
                    variant="ghost"
                    :avatar="{
                      alt: member.name,
                    }"
                    trailing-icon="i-lucide-user-round-minus"
                    :disabled="loading || !canEdit"
                    :label="member.name"
                    class="w-full"
                    :ui="{ trailingIcon: 'ml-auto' }"
                    @click="emit('remove', member)"
                />
            </template>

            <template v-if="canEdit && filteredCandidates.length">
                <p class="px-2 py-1 text-xs font-medium text-muted">
                    All members
                </p>
                <UButton
                    v-for="member in filteredCandidates"
                    :key="member.id"
                    color="neutral"
                    variant="ghost"
                    :avatar="{
                      alt: member.name,
                    }"
                    trailing-icon="i-lucide-user-round-plus"
                    :disabled="loading"
                    :label="member.name"
                    class="w-full"
                    :ui="{ trailingIcon: 'ml-auto' }"
                    @click="emit('add', member)"
                />
            </template>

            <p v-if="isEmpty" class="px-2 py-4 text-center text-sm text-muted">
                No members found
            </p>
        </div>
    </div>
</template>
