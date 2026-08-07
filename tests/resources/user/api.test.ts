import { describe, expect, it } from 'vitest'
import { makeUserApi } from '@/resources/user/api'
import { createClient, expectPathAndQuery } from '../support/harness'

describe('makeUserApi', () => {
    it('lists users via GET user with serialized grammar params', async () => {
        const client = createClient()
        await makeUserApi(client).index({ 'filter[role]': 'developer', 'include[]': ['reports_count', 'comments_count'] })
        expectPathAndQuery(
            client.get.mock.calls[0][0] as string,
            'user',
            'filter[role]=developer&include[]=reports_count&include[]=comments_count',
        )
    })

    it('aggregates via GET user/aggregate with serialized params', async () => {
        const client = createClient()
        await makeUserApi(client).aggregate({ 'aggregate[status:count]': 'approved,pending' })
        expectPathAndQuery(client.get.mock.calls[0][0] as string, 'user/aggregate', 'aggregate[status:count]=approved,pending')
    })

    it('shows a user via GET user/{id} with serialized params', async () => {
        const client = createClient()
        await makeUserApi(client).show('u1', { 'include[]': ['stats'] })
        expectPathAndQuery(client.get.mock.calls[0][0] as string, 'user/u1', 'include[]=stats')
    })

    it('stores a user via POST user with the data', async () => {
        const client = createClient()
        const data = { name: 'Ada', email: 'ada@test.dev', role: 'reporter' }
        await makeUserApi(client).store(data)
        expect(client.post).toHaveBeenCalledWith('user', data)
    })

    it('updates a user via PATCH user/{id} with the data', async () => {
        const client = createClient()
        const data = { role: 'developer' }
        await makeUserApi(client).update('u1', data)
        expect(client.patch).toHaveBeenCalledWith('user/u1', data)
    })

    it('deletes a user via DELETE user/{id}', async () => {
        const client = createClient()
        await makeUserApi(client).destroy('u1')
        expect(client.delete).toHaveBeenCalledWith('user/u1')
    })

    it('approves a user via POST user/{id}/approve', async () => {
        const client = createClient()
        await makeUserApi(client).approve('u1')
        expect(client.post).toHaveBeenCalledWith('user/u1/approve')
    })

    it('resets a password via POST user/{id}/reset-password with the data', async () => {
        const client = createClient()
        const data = { password: 'new-password' }
        await makeUserApi(client).resetPassword('u1', data)
        expect(client.post).toHaveBeenCalledWith('user/u1/reset-password', data)
    })
})
