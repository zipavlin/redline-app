import type { Role } from '@/domain/role'
import type { FieldType } from '@/domain/field'
import type { Paginated } from '@/core/api/types'

export interface Author {
    id: string
    name: string
    email?: string
}

export interface UserCounts {
    all: number
    active: number
    pending: number
}

export interface UserListResponse extends Paginated<UserRow> {
    counts: UserCounts
}

export interface UserStats {
    reports: number
    open: number
    resolved: number
}

export interface UserDetail {
    id: string
    name: string
    email: string
    role: Role
    status: string
    created_at: string
    stats: UserStats
}

export interface Contributor {
    id: string
    name: string
    reports_count: number
}

export type User = UserRow

export interface UserRow {
    id: string
    status: string
    created_at: string
    name?: string
    email?: string
    role?: Role
    initials?: string
    reports_count?: number
    comments_count?: number
}

export interface AuthField {
    name: string
    type: FieldType
    label?: string
    required?: boolean
    [key: string]: unknown
}
