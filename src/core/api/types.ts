/**
 * Shared API types — wire contracts used across all resources.
 */

/** Meta is {total} when unpaginated, {total, per_page, current_page, last_page} when paginated. */
export interface PaginationMeta {
    total: number
    per_page?: number
    current_page?: number
    last_page?: number
}

export interface Paginated<T> {
    data: T[]
    meta: PaginationMeta
}

/** Aggregate endpoint response — { <target>: { <operator>: <scalar|object|array> } }. */
export interface AggregateResult {
    [target_operator: string]: number | Record<string, number> | Record<string, Record<string, number>>
}

/** Normalized shape returned by ApiClient. */
export interface ApiResult<T = unknown> {
    ok: boolean
    status: number
    data: T
}
