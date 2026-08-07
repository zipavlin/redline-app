import { describe, expect, it } from 'vitest'
import { makeAuthApi } from '@/resources/auth/api'
import { createClient } from '../support/harness'

describe('makeAuthApi', () => {
    it('registers a user via POST auth/register with the submitted data', async () => {
        const client = createClient()
        const data = { name: 'Ada', email: 'ada@test.dev', role: 'reporter' }
        await makeAuthApi(client).register(data)
        expect(client.post).toHaveBeenCalledWith('auth/register', data)
    })

    it('logs in via POST auth/login with credentials', async () => {
        const client = createClient()
        const data = { email: 'ada@test.dev', password: 'secret' }
        await makeAuthApi(client).login(data)
        expect(client.post).toHaveBeenCalledWith('auth/login', data)
    })

    it('fetches the current session via GET auth/me', async () => {
        const client = createClient()
        await makeAuthApi(client).me()
        expect(client.get).toHaveBeenCalledWith('auth/me')
    })

    it('refreshes the session via GET auth/refresh', async () => {
        const client = createClient()
        await makeAuthApi(client).refresh()
        expect(client.get).toHaveBeenCalledWith('auth/refresh')
    })

    it('logs out via DELETE auth', async () => {
        const client = createClient()
        await makeAuthApi(client).logout()
        expect(client.delete).toHaveBeenCalledWith('auth')
    })

    it('requests a password-reset email via POST auth/forgot-password', async () => {
        const client = createClient()
        await makeAuthApi(client).forgotPassword('ada@test.dev')
        expect(client.post).toHaveBeenCalledWith('auth/forgot-password', { email: 'ada@test.dev' })
    })

    it('re-POSTs the signed reset link with the new password', async () => {
        const client = createClient()
        await makeAuthApi(client).resetPassword('token=abc&expires=1700000000', 'new-password')
        expect(client.post).toHaveBeenCalledWith('auth/reset-password?token=abc&expires=1700000000', { password: 'new-password' })
    })
})
