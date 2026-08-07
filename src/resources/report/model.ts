import type { Status } from '@/domain/status'
import type { Pin } from '@/core/pin'
import type { Comment } from '@/resources/comment/model'
import type { Screenshot } from '@/resources/screenshot/models'
import type { Video } from '@/resources/video/models'
import type { Author } from '@/resources/user/model'
import type { Paginated } from '@/core/api/types'
import type { Browser } from '@/core/browser'

export interface Report {
    id: string
    status: Status | string
    created_at: string
    title?: string | null
    body?: string
    pin: Pin | null
    element?: string | null
    url?: string
    location?: string
    author?: Author | null
    browser?: Browser
    screenshot?: Screenshot
    video?: Video
    comments?: Comment[]
}

export interface ReportCounts {
    all: number
    unresolved: number
    resolved: number
}

export interface ReportListResponse extends Paginated<DashboardReportRow> {
    counts: ReportCounts
}

export interface DashboardReportRow {
    id: string
    status: Status
    created_at: string
    title?: string
    body?: string
    url?: string
    location?: string
    author?: Author | null
    comments_count?: number
    screenshot_exists?: boolean
    video_exists?: boolean
}
