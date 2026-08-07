import type { ApiClient } from '@/core/api/client'
import { buildQuery } from '@/core/api/client'
import type { ListParams } from '@/core/api/params'
import type { ApiResult, AggregateResult } from '@/core/api/types'
import type { User, UserDetail, UserListResponse } from '@/resources/user/model'

export function makeUserApi(client: ApiClient) {
    return {
        index(params: ListParams = {}): Promise<ApiResult<UserListResponse>> {
            return client.get<UserListResponse>(`user${buildQuery(params)}`)
        },

        aggregate(params: ListParams = {}): Promise<ApiResult<AggregateResult>> {
            return client.get<AggregateResult>(`user/aggregate${buildQuery(params)}`)
        },

        show(id: string, params: ListParams = {}): Promise<ApiResult<UserDetail>> {
            return client.get<UserDetail>(`user/${id}${buildQuery(params)}`)
        },

        store(data: Record<string, unknown>): Promise<ApiResult<User>> {
            return client.post<User>('user', data)
        },

        update(id: string, data: Record<string, unknown>): Promise<ApiResult<User>> {
            return client.patch<User>(`user/${id}`, data)
        },

        destroy(id: string): Promise<ApiResult<null>> {
            return client.delete<null>(`user/${id}`)
        },

        approve(id: string): Promise<ApiResult<User>> {
            return client.post<User>(`user/${id}/approve`)
        },

        resetPassword(id: string, data: Record<string, unknown>): Promise<ApiResult<unknown>> {
            return client.post(`user/${id}/reset-password`, data)
        },
    }
}
