import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { commentKeys } from '@/resources/comment/keys'
import { useComments } from '@/resources/comment/queries'
import type { Comment } from '@/resources/comment/model'
import { mountResource, unmountResources } from '../support/harness'

function makeApi() {
    return { comment: { index: vi.fn() } }
}

const comments: Comment[] = [
    { id: 'c1', body: '<p>first</p>', created_at: '2026-01-01T00:00:00Z', author: { id: 'u1', name: 'Ada' } },
]

afterEach(() => {
    unmountResources()
    vi.restoreAllMocks()
})

describe('useComments', () => {
    it('fetches comments and caches them under the report-scoped key', async () => {
        const { api, queryClient, result } = mountResource(
            (api) => useComments('r1'),
            makeApi,
            (api) => api.comment.index.mockResolvedValue({ ok: true, status: 200, data: comments }),
        )
        await flushPromises()

        expect(api.comment.index).toHaveBeenCalledWith('r1')
        expect(result.data.value).toEqual(comments)
        expect(queryClient.getQueryData(commentKeys.list('r1'))).toEqual(comments)
    })

    it('throws "Failed to load comments" when the response is not ok', async () => {
        const { api, result } = mountResource(
            (api) => useComments('r1'),
            makeApi,
            (api) => api.comment.index.mockResolvedValue({ ok: false, status: 500, data: null }),
        )
        await flushPromises()

        expect(result.isError.value).toBe(true)
        expect(result.error.value?.message).toBe('Failed to load comments')
    })

    it('stays disabled when the report id is missing', async () => {
        const { api, result } = mountResource((api) => useComments(null), makeApi)
        await flushPromises()

        expect(api.comment.index).not.toHaveBeenCalled()
        expect(result.data.value).toBeUndefined()
    })

    it('enables and refetches when a reactive report id appears', async () => {
        const reportId = ref<string | null>(null)
        const { api, queryClient, result } = mountResource(
            (api) => useComments(reportId),
            makeApi,
            (api) => api.comment.index.mockResolvedValue({ ok: true, status: 200, data: comments }),
        )
        await flushPromises()
        expect(api.comment.index).not.toHaveBeenCalled()

        reportId.value = 'r2'
        await flushPromises()

        expect(api.comment.index).toHaveBeenCalledWith('r2')
        expect(result.data.value).toEqual(comments)
        expect(queryClient.getQueryData(commentKeys.list('r2'))).toEqual(comments)
    })
})
