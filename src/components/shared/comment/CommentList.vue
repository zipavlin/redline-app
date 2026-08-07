<script setup lang="ts">
/**
 * Comment thread rendered as a Nuxt UI Timeline.
 *
 * Presentational for the list itself (pass `comments` in), but owns the
 * per-comment edit/delete affordances: the auth context (`user` prop) gates
 * Edit (author only) and Delete (author OR admin) exactly mirroring the backend
 * policy. Editing swaps the Prose body for the shared InlineEditor and saves via
 * useUpdateCommentMutation (comment list refetches on invalidation); delete goes
 * through useConfirm → useDeleteCommentMutation.
 */
import { computed, ref } from 'vue'
import type { Comment } from '@/resources/comment/model'
import { getRelativeTime, getFormattedDatetime } from '@/core/datetime'
import { useUpdateCommentMutation, useDeleteCommentMutation } from '@/resources/comment/mutations'
import { useConfirm } from '@/composables/useConfirm'
import Prose from '@/components/shared/ui/Prose.vue'
import InlineEditor from '@/components/shared/ui/InlineEditor.vue'
import PopoverMenu from '@/components/shared/ui/PopoverMenu.vue'

/** Auth context passed from the host surface (widget / dashboard). */
export interface CommentAuthContext {
    id: string
    isAdmin: boolean
    isDeveloper: boolean
}

const props = withDefaults(defineProps<{
    comments?: Comment[]
    reportId?: string
    user?: CommentAuthContext | null
}>(), {
    comments: () => [],
    reportId: '',
    user: null,
})

const toast = useToast()
const { confirm } = useConfirm()
const updateComment = useUpdateCommentMutation()
const deleteComment = useDeleteCommentMutation()

// Per-comment edit state — never block the whole thread with one flag.
const editingId = ref<string | null>(null)
const savingId = ref<string | null>(null)

interface CommentTimelineItem {
    value: string
    title: string
    formated_date: string
    relative_date: string,
    description: string
    avatar: { alt: string }
    comment: Comment
    canEdit: boolean
    canDelete: boolean
}

const items = computed<CommentTimelineItem[]>(() =>
    props.comments.map(item => ({
        value: item.id,
        title: item.author?.name ?? 'Unknown',
        formated_date: getFormattedDatetime(item.created_at),
        relative_date: getRelativeTime(item.created_at),
        description: item.body,
        avatar: { alt: item.author?.name ?? '?' },
        comment: item,
        canEdit: !!props.user && props.user.id === item.author?.id,
        canDelete: !!props.user && (props.user.isAdmin || props.user.id === item.author?.id),
    })),
)

function commentActions(item: CommentTimelineItem): {
    label: string
    icon: string
    color?: string
    onClick: () => void
}[] {
    const actions = []
    if (item.canEdit) {
        actions.push({ label: 'Edit', icon: 'i-lucide-pencil', onClick: () => { editingId.value = item.comment.id } })
    }
    if (item.canDelete) {
        actions.push({
            label: 'Delete',
            icon: 'i-lucide-trash-2',
            color: 'error',
            onClick: () => removeComment(item.comment),
        })
    }
    return actions
}

async function saveEdit(id: string, body: string) {
    if (!props.reportId) return
    savingId.value = id
    try {
        await updateComment.mutateAsync({ reportId: props.reportId, id, body })
        // The comment list refetches via invalidation — close the editor only on success.
        editingId.value = null
        toast.add({ title: 'Comment updated', color: 'success' })
    } catch {
        toast.add({ title: 'Could not update comment', color: 'error' })
    } finally {
        savingId.value = null
    }
}

async function removeComment(comment: Comment) {
    if (!props.reportId) return
    const ok = await confirm(
        'Delete comment',
        'Are you sure? This cannot be undone.',
        { confirmLabel: 'Delete', color: 'error' },
    )
    if (!ok) return
    try {
        await deleteComment.mutateAsync({ reportId: props.reportId, id: comment.id })
        toast.add({ title: 'Comment deleted', color: 'success' })
    } catch {
        toast.add({ title: 'Could not delete comment', color: 'error' })
    }
}
</script>

<template>
    <UTimeline
        v-if="items.length"
        :items="items"
        :default-value="items.length"
        size="xs"
        color="neutral"
        data-component="comment-list"
        :ui="{ title: 'flex justify-between items-center gap-2', wrapper: 'pb-2' }"
    >
        <template #title="{ item }">
            <UTooltip :text="item.formated_date" arrow :content="{side: 'left', align: 'center', sideOffset: 2}">
                <span class="text-xs text-default">{{ item.relative_date }}</span>
            </UTooltip>
            <PopoverMenu
                v-if="item.canEdit || item.canDelete"
                placement="bottom"
                :trigger="{ icon: 'i-lucide-ellipsis', size: 'xs', variant: 'ghost' }"
                :items="commentActions(item)"
            />
        </template>
        <template #description="{ item }">
            <InlineEditor
                v-if="editingId === item.comment.id"
                :initial="item.comment.body"
                :loading="savingId === item.comment.id"
                @save="(html: string) => saveEdit(item.comment.id, html)"
                @cancel="editingId = null"
            />
            <Prose v-else :html="item.description" class="text-sm text-muted" />
        </template>
    </UTimeline>
</template>
