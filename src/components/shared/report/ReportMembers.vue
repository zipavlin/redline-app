<script setup lang="ts">
/**
 * Server-backed report members control: an overlapping avatar-stack trigger that
 * opens the Trello-style MembersPicker. Add/remove go through the optimistic
 * member mutations, which patch the Pinia store (source of truth) so the stack
 * updates without an emit. Candidate users come from GET /user, gated to editors
 * and degrading to the current user on 403.
 */
import { computed } from 'vue'
import { useStore, type SharedStore } from '@/composables/useStore'
import { useMemberCandidates } from '@/resources/user/queries'
import {
    memberMutationError,
    useAddMembersMutation,
    useRemoveMembersMutation,
} from '@/resources/report/mutations'
import { memberFromUser, type Member } from '@/resources/report/model'
import MembersPicker from '@/components/shared/report/MembersPicker.vue'
import { useToast } from '@nuxt/ui/composables/useToast'

const props = defineProps<{
    reportId: string
    members: Member[]
    canEdit: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const store = useStore<SharedStore>()
const toast = useToast()
const addMutation = useAddMembersMutation()
const removeMutation = useRemoveMembersMutation()

const { data: candidatesData } = useMemberCandidates({
    enabled: () => props.canEdit && open.value,
})

// Computed
const selfMember = computed<Member | null>(() => {
    const user = store.auth.user
    return user ? memberFromUser({ id: user.id, name: user.name }) : null
})

/**
 * The candidate query is lazy and 403s for non-admins; when it has no rows fall
 * back to the current user so "Assign to me" stays available without a
 * special-cased button.
 */
const candidatePool = computed<Member[]>(() => {
    const rows = candidatesData.value?.data
    if (rows?.length) return rows.map(memberFromUser)
    return selfMember.value ? [selfMember.value] : []
})

const candidates = computed<Member[]>(() => {
    const current = new Set(props.members.map(member => member.id))
    return candidatePool.value.filter(member => !current.has(member.id))
})

const pending = computed(() => addMutation.isPending.value || removeMutation.isPending.value)

// Functions
async function addMember(member: Member) {
    if (!props.canEdit || pending.value) return
    try {
        await addMutation.mutateAsync({ id: props.reportId, userIds: [member.id], optimistic: [member] })
    } catch (error) {
        toast.add({ title: memberMutationError(error), color: 'error' })
    }
}

async function removeMember(member: Member) {
    if (!props.canEdit || pending.value) return
    try {
        await removeMutation.mutateAsync({ id: props.reportId, userIds: [member.id] })
    } catch (error) {
        toast.add({ title: memberMutationError(error), color: 'error' })
    }
}
</script>

<template>
    <UPopover
        v-model:open="open"
        :content="{ side: 'bottom', align: 'end' }"
        arrow
    >
        <UTooltip text="Members" arrow>
            <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                aria-label="Members"
                :ui="{ base: 'rounded-full' }"
            >
                <UAvatarGroup
                    v-if="members.length"
                    size="2xs"
                    :max="3"
                    :ui="{ base: 'ring-muted bg-muted' }"
                >
                    <UAvatar
                        v-for="member in members"
                        :key="member.id"
                        :alt="member.name"
                        :ui="{ fallback: 'text-neutral' }"
                    />
                </UAvatarGroup>
                <UIcon
                    v-else
                    name="i-lucide-user-round-plus"
                    class="size-4"
                />
            </UButton>
        </UTooltip>

        <template #content="{ close }">
            <MembersPicker
                :members="members"
                :candidates="candidates"
                :can-edit="canEdit"
                :loading="pending"
                @add="addMember"
                @remove="removeMember"
            >
                <template #close>
                    <UButton
                        icon="i-lucide-x"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        square
                        aria-label="Close members"
                        @click="close"
                    />
                </template>
            </MembersPicker>
        </template>
    </UPopover>
</template>
