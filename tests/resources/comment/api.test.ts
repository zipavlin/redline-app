import { describe, expect, it } from 'vitest'
import { makeCommentApi } from '@/resources/comment/api'
import { createClient } from '../support/harness'

describe('makeCommentApi', () => {
    it('lists comments via GET report/{reportId}/comment', async () => {
        const client = createClient()
        await makeCommentApi(client).index('r1')
        expect(client.get).toHaveBeenCalledWith('report/r1/comment')
    })

    it('stores a comment via POST report/{reportId}/comment with the body', async () => {
        const client = createClient()
        await makeCommentApi(client).store('r1', '<p>hi</p>')
        expect(client.post).toHaveBeenCalledWith('report/r1/comment', { body: '<p>hi</p>' })
    })

    it('updates a comment via PATCH report/{reportId}/comment/{id} with the body', async () => {
        const client = createClient()
        await makeCommentApi(client).update('r1', 'c1', '<p>edited</p>')
        expect(client.patch).toHaveBeenCalledWith('report/r1/comment/c1', { body: '<p>edited</p>' })
    })

    it('deletes a comment via DELETE report/{reportId}/comment/{id}', async () => {
        const client = createClient()
        await makeCommentApi(client).destroy('r1', 'c1')
        expect(client.delete).toHaveBeenCalledWith('report/r1/comment/c1')
    })
})
