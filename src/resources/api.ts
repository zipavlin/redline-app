import type { ApiClient } from '@/core/api/client'
import { makeAuthApi } from '@/resources/auth/api'
import { makeReportApi } from '@/resources/report/api'
import { makeScreenshotApi } from '@/resources/screenshot/api'
import { makeVideoApi } from '@/resources/video/api'
import { makeCommentApi } from '@/resources/comment/api'
import { makeUserApi } from '@/resources/user/api'

/**
 * Build the full API namespace (mirrors the backend routes) from a client.
 * Shared by the widget (Redline) and dashboard (RedlineDashboard) bootstraps.
 */
export function makeApi(client: ApiClient) {
    return {
        auth:       makeAuthApi(client),
        report:     makeReportApi(client),
        screenshot: makeScreenshotApi(client),
        video:      makeVideoApi(client),
        comment:    makeCommentApi(client),
        user:       makeUserApi(client),
    }
}

/** The full typed API namespace. */
export type Api = ReturnType<typeof makeApi>
