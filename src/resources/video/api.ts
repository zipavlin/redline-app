import type { ApiClient } from '@/core/api/client'
import type { ApiResult } from '@/core/api/types'
import type { Video } from '@/resources/video/models'

export function makeVideoApi(client: ApiClient) {
    return {
        show: (reportId: string): Promise<ApiResult<Video>> => client.get<Video>(`report/${reportId}/video`),

        async store(reportId: string, blob: Blob): Promise<ApiResult<Video>> {
            const formData = new FormData()
            // Use actual MIME type so backend stores the right extension (mp4 on Safari, webm elsewhere)
            const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
            formData.append('video', blob, `video.${extension}`)
            return client.post<Video>(`report/${reportId}/video`, formData, { isFormData: true })
        },
    }
}
