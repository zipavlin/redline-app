import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import { commentKeys } from '@/resources/comment/keys'
import type { Comment } from '@/resources/comment/model'

export function useComments(reportId: MaybeRefOrGetter<string | null | undefined>) {
    const api = useApi()
    return useQuery({
        queryKey: computed(() => commentKeys.list(toValue(reportId) ?? '')),
        enabled: computed(() => !!toValue(reportId)),
        queryFn: async (): Promise<Comment[]> => {
            const res = await api.comment.index(toValue(reportId) as string)
            if (!res.ok) throw new Error('Failed to load comments')
            return res.data
        },
    })
}
