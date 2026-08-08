<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import type { SelectedReport } from '@/store/widget/selection'
import { useAddCommentMutation } from '@/resources/comment/mutations'
import { useComments } from '@/resources/comment/queries'
import CommentForm from '@/components/shared/comment/CommentForm.vue'
import CommentList from '@/components/shared/comment/CommentList.vue'
import { useToast } from '@nuxt/ui/composables/useToast'

const props = defineProps<{ report: SelectedReport }>()
const store = useStore<WidgetStore>()
const draft = ref('')
const { data: comments } = useComments(props.report.id)
const addComment = useAddCommentMutation()
const toast = useToast()

const user = computed(() => {
    const u = store.auth.user
    return u ? { id: u.id, isAdmin: u.isAdmin, isDeveloper: u.isDeveloper } : null
})

// The widget's active report keeps its `comments` array from the detail include —
// it goes stale after add/edit/delete (the thread itself refetches via TanStack).
// Mirror the query into the Pinia report so the header chip count never lies.
watch(comments, (list) => {
    const active = store.report.active
    if (list && active && active.id === props.report.id) {
        active.comments = list
    }
})

async function submitComment(body: string) {
    const id = props.report.id
    if (!id) return
    try {
        await addComment.mutateAsync({ reportId: id, body })
        draft.value = ''
    } catch {
        toast.add({ title: 'Could not add comment', color: 'error' })
    }
}
</script>

<template>
    <div>
        <CommentList
            :comments="comments ?? []"
            :report-id="props.report.id"
            :user="user"
            class="mb-2"
        />
        <CommentForm
            v-model="draft"
            :loading="addComment.isPending.value"
            @submit="submitComment"
        />
    </div>
</template>
