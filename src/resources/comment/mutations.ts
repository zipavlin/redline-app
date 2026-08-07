import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import { commentKeys } from '@/resources/comment/keys'
import { reportKeys } from '@/resources/report/keys'
import type { Comment } from '@/resources/comment/model'

export function useAddCommentMutation() {
    const api = useApi()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ reportId, body }: { reportId: string; body: string }): Promise<Comment> => {
            const res = await api.comment.store(reportId, body)
            if (!res.ok) throw new Error('Failed to add comment')
            return res.data
        },
        onSuccess: (_data, { reportId }) => {
            qc.invalidateQueries({ queryKey: commentKeys.list(reportId) })
            qc.invalidateQueries({ queryKey: reportKeys.detail(reportId) })
        },
    })
}

export function useUpdateCommentMutation() {
    const api = useApi()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ reportId, id, body }: { reportId: string; id: string; body: string }): Promise<Comment> => {
            const res = await api.comment.update(reportId, id, body)
            if (!res.ok) throw new Error('Failed to update comment')
            return res.data
        },
        onSuccess: (_data, { reportId }) => {
            qc.invalidateQueries({ queryKey: commentKeys.list(reportId) })
            qc.invalidateQueries({ queryKey: reportKeys.detail(reportId) })
        },
    })
}

export function useDeleteCommentMutation() {
    const api = useApi()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ reportId, id }: { reportId: string; id: string }): Promise<void> => {
            const res = await api.comment.destroy(reportId, id)
            if (!res.ok) throw new Error('Failed to delete comment')
        },
        onSuccess: (_data, { reportId }) => {
            qc.invalidateQueries({ queryKey: commentKeys.list(reportId) })
            qc.invalidateQueries({ queryKey: reportKeys.detail(reportId) })
        },
    })
}
