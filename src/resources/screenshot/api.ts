import type { ApiClient } from '@/core/api/client'
import type { ApiResult } from '@/core/api/types'
import type { Screenshot } from '@/resources/screenshot/models'

export function makeScreenshotApi(client: ApiClient) {
    return {
        show: (reportId: string): Promise<ApiResult<Screenshot>> => client.get<Screenshot>(`report/${reportId}/screenshot`),

        async store(reportId: string, blob: Blob): Promise<ApiResult<Screenshot>> {
            const formData = new FormData()
            formData.append('screenshot', blob, 'screenshot.png')
            return client.post<Screenshot>(`report/${reportId}/screenshot`, formData, { isFormData: true })
        },
    }
}
