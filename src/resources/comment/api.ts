import type { ApiClient } from '@/core/api/client'
import type { ApiResult } from '@/core/api/types'
import type { Comment } from '@/resources/comment/model'

export function makeCommentApi(client: ApiClient) {
    return {
        index: (reportId: string): Promise<ApiResult<Comment[]>> => client.get<Comment[]>(`report/${reportId}/comment`),
        store: (reportId: string, body: string): Promise<ApiResult<Comment>> => client.post<Comment>(`report/${reportId}/comment`, { body }),
        update: (reportId: string, id: string, body: string): Promise<ApiResult<Comment>> =>
            client.patch<Comment>(`report/${reportId}/comment/${id}`, { body }),
        destroy: (reportId: string, id: string): Promise<ApiResult<null>> => client.delete<null>(`report/${reportId}/comment/${id}`),
    }
}
