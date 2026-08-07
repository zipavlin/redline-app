import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { userKeys } from '@/resources/user/keys'
import { useCreateUserMutation, useDeleteUserMutation, useUpdateUserMutation } from '@/resources/user/mutations'
import { mountResource, unmountResources } from '../support/harness'

function makeApi() {
    return { user: { update: vi.fn(), destroy: vi.fn(), store: vi.fn() } }
}

function mountMutations() {
    return mountResource(
        (api) => ({
            update: useUpdateUserMutation(),
            delete: useDeleteUserMutation(),
            create: useCreateUserMutation(),
        }),
        makeApi,
    )
}

afterEach(() => {
    unmountResources()
    vi.restoreAllMocks()
})

describe('useUpdateUserMutation', () => {
    it('PATCHes user/{id} with the data and invalidates user queries', async () => {
        const { api, queryClient, result } = mountMutations()
        api.user.update.mockResolvedValue({ ok: true, status: 200, data: { id: 'u1', name: 'Ada' } })
        queryClient.setQueryData(userKeys.all, {})
        await result.update.mutateAsync({ id: 'u1', data: { name: 'Ada' } })
        await flushPromises()

        expect(api.user.update).toHaveBeenCalledWith('u1', { name: 'Ada' })
        expect(queryClient.getQueryState(userKeys.all)?.isInvalidated).toBe(true)
    })

    it('throws "Failed to update user" when the response is not ok', async () => {
        const { api, result } = mountMutations()
        api.user.update.mockResolvedValue({ ok: false, status: 422, data: null })
        await expect(result.update.mutateAsync({ id: 'u1', data: {} })).rejects.toThrow('Failed to update user')
    })
})

describe('useDeleteUserMutation', () => {
    it('DELETEs user/{id} and invalidates user queries', async () => {
        const { api, queryClient, result } = mountMutations()
        api.user.destroy.mockResolvedValue({ ok: true, status: 200, data: null })
        queryClient.setQueryData(userKeys.all, {})
        await result.delete.mutateAsync('u1')
        await flushPromises()

        expect(api.user.destroy).toHaveBeenCalledWith('u1')
        expect(queryClient.getQueryState(userKeys.all)?.isInvalidated).toBe(true)
    })

    it('throws "Failed to delete user" when the response is not ok', async () => {
        const { api, result } = mountMutations()
        api.user.destroy.mockResolvedValue({ ok: false, status: 500, data: null })
        await expect(result.delete.mutateAsync('u1')).rejects.toThrow('Failed to delete user')
    })
})

describe('useCreateUserMutation', () => {
    it('POSTs the user data and reports invitationSent from invitation_sent', async () => {
        const { api, queryClient, result } = mountMutations()
        const data = { name: 'Ada', email: 'ada@test.dev', role: 'reporter' }
        api.user.store.mockResolvedValue({
            ok: true,
            status: 200,
            data: { id: 'u1', name: 'Ada', invitation_sent: true },
        })
        queryClient.setQueryData(userKeys.all, {})
        const outcome = await result.create.mutateAsync(data)
        await flushPromises()

        expect(api.user.store).toHaveBeenCalledWith(data)
        expect(outcome.user).toEqual({ id: 'u1', name: 'Ada', invitation_sent: true })
        expect(outcome.invitationSent).toBe(true)
        expect(queryClient.getQueryState(userKeys.all)?.isInvalidated).toBe(true)
    })

    it('reports invitationSent false when the response has no invitation_sent flag', async () => {
        const { api, result } = mountMutations()
        api.user.store.mockResolvedValue({ ok: true, status: 200, data: { id: 'u1', name: 'Ada' } })
        const outcome = await result.create.mutateAsync({ name: 'Ada' })
        await flushPromises()
        expect(outcome.invitationSent).toBe(false)
    })

    it('reports invitationError from invitation_error when the invitation was not sent', async () => {
        const { api, result } = mountMutations()
        api.user.store.mockResolvedValue({
            ok: true,
            status: 200,
            data: { id: 'u1', name: 'Ada', invitation_sent: false, invitation_error: 'mail_not_configured' },
        })
        const outcome = await result.create.mutateAsync({ name: 'Ada' })
        await flushPromises()

        expect(outcome.invitationError).toBe('mail_not_configured')
        expect(outcome.invitationSent).toBe(false)
    })

    it('throws "Failed to create user" when the response is not ok', async () => {
        const { api, result } = mountMutations()
        api.user.store.mockResolvedValue({ ok: false, status: 422, data: null })
        await expect(result.create.mutateAsync({ name: 'Ada' })).rejects.toThrow('Failed to create user')
    })
})
