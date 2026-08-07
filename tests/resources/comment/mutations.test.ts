import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { commentKeys } from '@/resources/comment/keys'
import { reportKeys } from '@/resources/report/keys'

import { useUpdateCommentMutation, useDeleteCommentMutation } from '@/resources/comment/mutations'

interface CommentMutations {
    updateComment: ReturnType<typeof useUpdateCommentMutation>
    deleteComment: ReturnType<typeof useDeleteCommentMutation>
}

function mountRunner() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = {
        comment: { update: vi.fn(), destroy: vi.fn() },
    }
    // Populated synchronously by setup() during mount(), before mountRunner returns.
    let mutations!: CommentMutations
    const wrapper = mount(
        defineComponent({
            setup() {
                mutations = {
                    updateComment: useUpdateCommentMutation(),
                    deleteComment: useDeleteCommentMutation(),
                }
                return {}
            },
            template: '<div />',
        }),
        {
            global: {
                plugins: [[VueQueryPlugin, { queryClient }]],
                provide: {
                    redline: { api, config: {} },
                },
            },
        },
    )
    return { wrapper, api, queryClient, mutations }
}

describe('useUpdateCommentMutation', () => {
    it('PATCHes report/{reportId}/comment/{id} with the body', async () => {
        const { api, mutations } = mountRunner()
        api.comment.update.mockResolvedValue({ ok: true, data: { id: 'c1', body: '<p>new</p>' } })
        await mutations.updateComment.mutateAsync({ reportId: 'r1', id: 'c1', body: '<p>new</p>' })
        await flushPromises()
        expect(api.comment.update).toHaveBeenCalledWith('r1', 'c1', '<p>new</p>')
    })

    it('invalidates the comment list and report detail for the report', async () => {
        const { api, mutations, queryClient } = mountRunner()
        api.comment.update.mockResolvedValue({ ok: true, data: { id: 'c1', body: '<p>new</p>' } })
        queryClient.setQueryData(commentKeys.list('r1'), [])
        queryClient.setQueryData(reportKeys.detail('r1'), { id: 'r1' })
        await mutations.updateComment.mutateAsync({ reportId: 'r1', id: 'c1', body: '<p>new</p>' })
        await flushPromises()
        expect(queryClient.getQueryState(commentKeys.list('r1'))?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.detail('r1'))?.isInvalidated).toBe(true)
    })
})

describe('useDeleteCommentMutation', () => {
    it('DELETEs report/{reportId}/comment/{id}', async () => {
        const { api, mutations } = mountRunner()
        api.comment.destroy.mockResolvedValue({ ok: true, data: null })
        await mutations.deleteComment.mutateAsync({ reportId: 'r1', id: 'c1' })
        await flushPromises()
        expect(api.comment.destroy).toHaveBeenCalledWith('r1', 'c1')
    })

    it('invalidates the comment list and report detail for the report', async () => {
        const { api, mutations, queryClient } = mountRunner()
        api.comment.destroy.mockResolvedValue({ ok: true, data: null })
        queryClient.setQueryData(commentKeys.list('r1'), [])
        queryClient.setQueryData(reportKeys.detail('r1'), { id: 'r1' })
        await mutations.deleteComment.mutateAsync({ reportId: 'r1', id: 'c1' })
        await flushPromises()
        expect(queryClient.getQueryState(commentKeys.list('r1'))?.isInvalidated).toBe(true)
        expect(queryClient.getQueryState(reportKeys.detail('r1'))?.isInvalidated).toBe(true)
    })
})
