<script setup lang="ts">
/**
 * Report members control, in two modes:
 *
 * - Committed (`reportId` given): a server-backed overlapping avatar-stack trigger
 *   opening the Trello-style MembersPicker. Add/remove go through the optimistic
 *   member mutations, which patch the Pinia store (source of truth) so the stack
 *   updates without an emit.
 * - Draft (no `reportId`): the same trigger/picker for a not-yet-saved report. Nothing
 *   is persisted - the parent owns the selection via `v-model:memberIds` and assigns it
 *   after the create call succeeds.
 *
 * Draft hosts gate rendering on authentication (guests never see the control); the
 * component does not gate itself in draft mode.
 *
 * Candidate users come from GET /user, fetched lazily once the picker first opens, and
 * degrade to the current user on 403/empty so "Assign to me" stays available.
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

type PopoverPosition = { side: 'top' | 'bottom'; align: 'start' | 'end' }

const props = withDefaults(defineProps<{
    reportId?: string
    members?: Member[]
    canEdit?: boolean
    /** The report's author, excluded from the selectable candidates (never a member). */
    authorId?: string | null
    placement?: 'bottom-end' | 'top-start'
    size?: 'xs' | 'sm'
}>(), {
    placement: 'bottom-end',
    size: 'xs',
    authorId: null,
})

const open = defineModel<boolean>('open', { default: false })
const memberIds = defineModel<string[]>('memberIds', { default: () => [] })

const store = useStore<SharedStore>()
const toast = useToast()
const addMutation = useAddMembersMutation()
const removeMutation = useRemoveMembersMutation()

const isCommitted = computed(() => !!props.reportId)
// Draft selection is always editable; the committed mode is gated by its prop.
const editable = computed(() => (isCommitted.value ? !!props.canEdit : true))

const { data: candidatesData } = useMemberCandidates({
    enabled: () => editable.value && open.value,
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

/**
 * Draft members resolve from the same pool so an id picked before the candidate
 * query returns (self, typically) still renders instead of vanishing.
 */
const displayedMembers = computed<Member[]>(() => {
    if (isCommitted.value) return props.members ?? []
    const pool = new Map<string, Member>()
    if (selfMember.value) pool.set(selfMember.value.id, selfMember.value)
    for (const member of candidatePool.value) pool.set(member.id, member)
    return memberIds.value
        .map(id => pool.get(id))
        .filter((member): member is Member => !!member)
})

const candidates = computed<Member[]>(() => {
    const shown = new Set(displayedMembers.value.map(member => member.id))
    return candidatePool.value.filter(member => !shown.has(member.id))
})

// Draft selection has no server round-trip, so it is never pending.
const pending = computed(() =>
    isCommitted.value && (addMutation.isPending.value || removeMutation.isPending.value),
)

const contentPosition = computed<PopoverPosition>(() =>
    props.placement === 'top-start'
        ? { side: 'top', align: 'start' }
        : { side: 'bottom', align: 'end' },
)

// Functions
function addMember(member: Member): void {
    if (!editable.value || pending.value) return
    if (isCommitted.value) void addServerMember(member)
    else addDraftMember(member)
}

function removeMember(member: Member): void {
    if (!editable.value || pending.value) return
    if (isCommitted.value) void removeServerMember(member)
    else removeDraftMember(member)
}

function addDraftMember(member: Member): void {
    if (!memberIds.value.includes(member.id)) memberIds.value = [...memberIds.value, member.id]
}

function removeDraftMember(member: Member): void {
    memberIds.value = memberIds.value.filter(id => id !== member.id)
}

async function addServerMember(member: Member): Promise<void> {
    try {
        await addMutation.mutateAsync({ id: props.reportId!, userIds: [member.id], optimistic: [member] })
    } catch (error) {
        toast.add({ title: memberMutationError(error), color: 'error' })
    }
}

async function removeServerMember(member: Member): Promise<void> {
    try {
        await removeMutation.mutateAsync({ id: props.reportId!, userIds: [member.id] })
    } catch (error) {
        toast.add({ title: memberMutationError(error), color: 'error' })
    }
}
</script>

<template>
    <UPopover
        v-model:open="open"
        :content="contentPosition"
        arrow
    >
        <UTooltip text="Members" arrow>
            <UButton
                color="neutral"
                variant="ghost"
                :size="size"
                square
                aria-label="Members"
                :ui="{ base: 'rounded-full' }"
            >
                <UAvatarGroup
                    v-if="displayedMembers.length"
                    size="2xs"
                    :max="3"
                    :ui="{ base: 'ring-muted bg-muted' }"
                >
                    <UAvatar
                        v-for="member in displayedMembers"
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
                :members="displayedMembers"
                :candidates="candidates"
                :can-edit="editable"
                :loading="pending"
                :author-id="authorId"
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
