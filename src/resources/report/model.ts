import type { Status } from '@/domain/status'
import type { Priority } from '@/domain/priority'
import { initialsFromName } from '@/domain/initials'
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
    priority: Priority | string
    due_at?: string | null
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
    members?: Member[]
    members_count?: number
    members_exists?: boolean
}

/** A report member as projected by the backend `{ id, name, initials }`. */
export interface Member {
    id: string
    name: string
    initials: string
}

export interface MembersResponse {
    members: Member[]
}

/**
 * Project a user list row onto the member shape, deriving initials when the
 * user payload did not include them.
 */
export function memberFromUser(user: { id: string; name?: string; initials?: string }): Member {
    const name = user.name ?? ''
    return { id: user.id, name, initials: user.initials || initialsFromName(name) }
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
    priority: Priority
    due_at?: string | null
    created_at: string
    title?: string
    body?: string
    url?: string
    location?: string
    author?: Author | null
    comments_count?: number
    screenshot_exists?: boolean
    video_exists?: boolean
    members_count?: number
    members_exists?: boolean
}
