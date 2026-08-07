/**
 * Redline query-grammar parameter types + builder helpers.
 *
 * Mirrors the backend grammar documented in src/Http/Query/QuerySchema.php.
 * `ListParams` is the canonical filter shape - replaces the old flat
 * `ReportListParams` / `UserListParams` / `URL_FILTER_KEYS` / `FilterKey`.
 *
 * Every collection endpoint accepts the same parameter groups. The shape is
 * `<group>[<target>[:<operator>]]=<value>`, where keys already contain brackets:
 *
 *   filter[status]=unresolved
 *   filter[body:like]=text
 *   filter[author.name:like]=Zig
 *   filter[comments:exists]=1
 *   include[]=pin
 *   include[author]=id,name
 *   include[]=comments:count
 *   include[]=screenshot:exists
 *   sort[created_at]=desc
 *   paginate[per_page]=16
 *   paginate[page]=1
 *   aggregate[status:count]=unresolved,resolved
 *   group_by[]=status
 *
 * Values can be a string or string[] - arrays produce duplicate keys
 * (via URLSearchParams.append), essential for multiple include[] entries.
 */

/** Param bag: string keys for single values, string arrays for duplicate keys. */
export type ListParams = Record<string, string | string[]>

/** Direction for sort[] + legacy use. */
export type SortDir = 'asc' | 'desc'

// Builder helpers

export function filterParams(target: string, value: string, operator?: string): ListParams {
    const key = operator ? `filter[${target}:${operator}]` : `filter[${target}]`
    return { [key]: value }
}

export function sortParams(column: string, dir: SortDir): ListParams {
    return { [`sort[${column}]`]: dir }
}

export function paginateParams(page: number, perPage?: number): ListParams {
    const p: ListParams = { 'paginate[page]': String(page) }
    if (perPage !== undefined) p['paginate[per_page]'] = String(perPage)
    return p
}

/**
 * Merge multiple param bags. When the same key appears in multiple bags:
 * String values overwrite (last wins).
 * If any bag has a string[] for that key, results are merged into an array.
 * Use arrays for duplicate-key params like include[].
 */
export function mergeParams(...bags: ListParams[]): ListParams {
    return Object.assign({}, ...bags)
}

/** Produce a non-overwriting include entry. Use for multiple include[] values. */
export function includeArr(targets: string[]): ListParams {
    return { 'include[]': targets }
}
