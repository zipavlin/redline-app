/**
 * Pure helpers for the Home dashboard (landing page).
 *
 * Layering: resources/ may import core/, domain/, composables/ and sibling
 * resources/ modules only (see .dependency-cruiser.cjs) - this file has no
 * DOM or API I/O, so it's unit-testable without mocks.
 */
import { STATUSES, STATUS_META, type Status } from '@/domain/status'
import type { Author, Contributor } from '@/resources/user/model'

export interface DonutSegment {
    status: Status
    label: string
    count: number
    /** Full Tailwind bg class from STATUS_META.bar - e.g. `bg-error` (legend dots). */
    barClass: string
    /** Full Tailwind stroke class mirroring the segment color - e.g. `stroke-error` (donut arcs). */
    strokeClass: string
}

/**
 * bg-* (STATUS_META) -> stroke-* (SVG arcs). Written out as full literals so
 * Tailwind's static analysis sees every class; the set mirrors STATUS_META.bar
 * exactly (including done's /50 modifier).
 */
const STROKE_BY_BAR: Record<string, string> = {
    'bg-error': 'stroke-error',
    'bg-warning': 'stroke-warning',
    'bg-info': 'stroke-info',
    'bg-success': 'stroke-success',
    'bg-success/50': 'stroke-success/50',
}

/**
 * Map a `status => count` aggregate response ({ new: 3, ... }) to donut
 * segments. Zero-count statuses are omitted (the donut hides them); order
 * follows the report lifecycle (STATUSES).
 */
export function statusSegments(statusCounts: Record<string, number>): DonutSegment[] {
    return STATUSES
        .filter((status) => (statusCounts[status] ?? 0) > 0)
        .map((status) => {
            const barClass = STATUS_META[status].bar

            return {
                status,
                label: STATUS_META[status].label,
                count: statusCounts[status] ?? 0,
                barClass,
                strokeClass: STROKE_BY_BAR[barClass] ?? 'stroke-default',
            }
        })
}

/**
 * Join an `author:count` aggregate map ({ "<uuid>": count }) with the
 * author:unique list, and take the top-N by report count. Output uses the
 * existing Contributor shape. Authors with no counted reports are dropped;
 * ties keep author-list order (stable sort).
 */
export function topAuthors(countMap: Record<string, number>, authorList: Author[], n: number): Contributor[] {
    return authorList
        .map((author) => ({
            id: author.id,
            name: author.name,
            reports_count: countMap[author.id] ?? 0,
        }))
        .filter((contributor) => contributor.reports_count > 0)
        .sort((a, b) => b.reports_count - a.reports_count)
        .slice(0, n)
}
