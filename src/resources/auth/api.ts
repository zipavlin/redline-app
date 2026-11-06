import type { ApiClient } from '@/core/api/client'
import type { ApiResult } from '@/core/api/types'
import type { AuthMe, AuthSuccess } from '@/resources/auth/model'

export function makeAuthApi(client: ApiClient) {
    return {
        register: (data: Record<string, unknown>): Promise<ApiResult<AuthSuccess>> => client.post<AuthSuccess>('auth/register', data),
        login: (data: Record<string, unknown>): Promise<ApiResult<AuthSuccess>> => client.post<AuthSuccess>('auth/login', data),
        me: (): Promise<ApiResult<AuthMe>> => client.get<AuthMe>('auth/me'),
        updateMe: (data: { notify_new_reports: boolean }): Promise<ApiResult<AuthSuccess>> => client.patch<AuthSuccess>('auth/me', data),
        refresh: (): Promise<ApiResult<AuthSuccess>> => client.get<AuthSuccess>('auth/refresh'),
        logout: (): Promise<ApiResult<null>> => client.delete<null>('auth'),

        /**
         * Password reset (self-service). forgotPassword emails a signed link;
         * resetPassword re-POSTs that link's signed query + the new password.
         */
        forgotPassword: (email: string): Promise<ApiResult<unknown>> => client.post('auth/forgot-password', { email }),
        resetPassword: (signedQuery: string, password: string): Promise<ApiResult<unknown>> =>
            client.post(`auth/reset-password?${signedQuery}`, { password }),
    }
}
