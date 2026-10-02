import type { ApiClient } from '@/core/api/client'
import { buildQuery } from '@/core/api/client'
import type { ListParams } from '@/core/api/params'
import type { ApiResult, AggregateResult } from '@/core/api/types'
import type { Report, ReportListResponse, MembersResponse } from '@/resources/report/model'

export function makeReportApi(client: ApiClient) {
    return {
        list(params: ListParams = {}): Promise<ApiResult<ReportListResponse>> {
            return client.get<ReportListResponse>(`report${buildQuery(params)}`)
        },

        aggregate(params: ListParams = {}): Promise<ApiResult<AggregateResult>> {
            return client.get<AggregateResult>(`report/aggregate${buildQuery(params)}`)
        },

        show(id: string, params: ListParams = {}): Promise<ApiResult<Report>> {
            return client.get<Report>(`report/${id}${buildQuery(params)}`)
        },

        store(data: Record<string, unknown>): Promise<ApiResult<Report>> {
            return client.post<Report>('report', data)
        },

        destroy(id: string): Promise<ApiResult<null>> {
            return client.delete<null>(`report/${id}`)
        },

        move(id: string, pin: Record<string, unknown>): Promise<ApiResult<Report>> {
            return client.post<Report>(`report/${id}/move`, pin)
        },

        update(id: string, body: string): Promise<ApiResult<Report>> {
            return client.patch<Report>(`report/${id}`, { body })
        },

        status(id: string, status: string): Promise<ApiResult<Report>> {
            return client.patch<Report>(`report/${id}/status`, { status })
        },

        addMembers(id: string, userIds: string[]): Promise<ApiResult<MembersResponse>> {
            return client.post<MembersResponse>(`report/${id}/member`, { user_ids: userIds })
        },

        removeMembers(id: string, userIds: string[]): Promise<ApiResult<MembersResponse>> {
            return client.delete<MembersResponse>(`report/${id}/member`, { user_ids: userIds })
        },
    }
}
