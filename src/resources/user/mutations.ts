import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useApi } from '@/composables/useApi'
import { userKeys } from '@/resources/user/keys'
import type { User } from '@/resources/user/model'

function useUsersInvalidate() {
    const qc = useQueryClient()
    return () => qc.invalidateQueries({ queryKey: userKeys.all })
}

export function useUpdateUserMutation() {
    const api = useApi()
    const invalidate = useUsersInvalidate()
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }): Promise<User> => {
            const res = await api.user.update(id, data)
            if (!res.ok) throw new Error('Failed to update user')
            return res.data
        },
        onSuccess: invalidate,
    })
}

export function useDeleteUserMutation() {
    const api = useApi()
    const invalidate = useUsersInvalidate()
    return useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const res = await api.user.destroy(id)
            if (!res.ok) throw new Error('Failed to delete user')
        },
        onSuccess: invalidate,
    })
}

export function useCreateUserMutation() {
    const api = useApi()
    const invalidate = useUsersInvalidate()
    return useMutation({
        mutationFn: async (data: Record<string, unknown>): Promise<{ user: User; invitationSent: boolean }> => {
            const res = await api.user.store(data)
            if (!res.ok) throw new Error('Failed to create user')
            const user = res.data as User & { invitation_sent?: boolean }
            return { user, invitationSent: Boolean(user.invitation_sent) }
        },
        onSuccess: invalidate,
    })
}
