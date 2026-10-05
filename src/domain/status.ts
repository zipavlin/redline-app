/**
 * Status presentation metadata - shared by widget + dashboard.
 * `color` maps a status to a Nuxt UI color (UBadge/UButton etc.);
 * `bar`/`dot` are Tailwind bg utilities for the Distribution bar and legend dots.
 * Order matches the report lifecycle.
 */
import type { Role } from '@/domain/role'

export const STATUSES = ['new', 'noticed', 'progress', 'resolved', 'done'] as const
export type Status = (typeof STATUSES)[number]

/** Statuses where work is still needed (Status::open). */
export const OPEN_STATUSES = ['new', 'noticed', 'progress'] as const satisfies readonly Status[]
/** Statuses that are probably done (Status::closed). */
export const CLOSED_STATUSES = ['resolved', 'done'] as const satisfies readonly Status[]

export function isOpenStatus(status: Status): boolean {
    return (OPEN_STATUSES as readonly Status[]).includes(status)
}
export function isClosedStatus(status: Status): boolean {
    return (CLOSED_STATUSES as readonly Status[]).includes(status)
}

/**
 * Lifecycle edges (bidirectional), mirroring Status::canTransitionTo:
 *   new <-> noticed <-> progress <-> resolved <-> done
 *                  \___ noticed <-> resolved ___/
 */
const STATUS_EDGES: readonly (readonly [Status, Status])[] = [
    ['new', 'noticed'],
    ['noticed', 'progress'],
    ['progress', 'resolved'],
    ['resolved', 'done'],
    ['noticed', 'resolved'], // Skip progress
]

export function canTransitionStatus(from: Status, to: Status): boolean {
    return STATUS_EDGES.some(([a, b]) => (from === a && to === b) || (from === b && to === a))
}

/** Nuxt UI semantic colors. */
export type StatusColor = 'error' | 'warning' | 'info' | 'success' | 'neutral'

export interface StatusMeta {
    label: string
    action: string
    icon: string
    actionIcon: string
    color: StatusColor
    progress: number
    bar: string
    dot: string
}

export const STATUS_META: Record<Status, StatusMeta> = {
    new:      { label: 'New',      action: '/',       icon: 'i-lucide-sparkles',      actionIcon: 'i-lucide-sparkles',           color: 'error',   progress: 0, bar: 'bg-error',       dot: 'bg-error' },
    noticed:  { label: 'Noticed',  action: 'Reopen',  icon: 'i-lucide-eye',           actionIcon: 'i-lucide-rotate-ccw',         color: 'warning', progress: 15, bar: 'bg-warning',     dot: 'bg-warning' },
    progress: { label: 'Progress', action: 'Claim',   icon: 'i-lucide-loader-circle', actionIcon: 'i-lucide-circle-arrow-right', color: 'info',    progress: 75, bar: 'bg-info',        dot: 'bg-info' },
    resolved: { label: 'Resolved', action: 'Resolve', icon: 'i-lucide-check',         actionIcon: 'i-lucide-circle-check',       color: 'success', progress: 100, bar: 'bg-success',     dot: 'bg-success' },
    done:     { label: 'Done',     action: 'Close',   icon: 'i-lucide-crown',         actionIcon: 'i-lucide-circle-check-big',   color: 'success', progress: 100, bar: 'bg-success/50',  dot: 'bg-success/50' },
}

export function statusColor(status: Status): StatusColor {
    return STATUS_META[status]?.color ?? 'neutral'
}

export function statusProgress(status: Status): number {
    return STATUS_META[status]?.progress ?? 0
}

export function statusLabel(status: Status): string {
    return STATUS_META[status]?.label ?? status
}

export function statusAction(status: Status): string {
    return STATUS_META[status]?.action ?? status
}

export function statusIcon(status: Status): string {
    return STATUS_META[status]?.icon ?? status
}

export function statusActionIcon(status: Status): string {
    return STATUS_META[status]?.actionIcon ?? status
}

/**
 * Direction-aware action labels, keyed by the from→to pair. The target-only
 * `STATUS_META.action` (the fallback in statusAction) cannot tell a forward step
 * from a rewind, so a rewind reused the target's forward label and painted it
 * success - resolved→progress is a "Rollback", not progress's "Claim". The action
 * depends on BOTH endpoints, so each reachable edge is listed explicitly; labels
 * repeat across edges (noticed→resolved and progress→resolved both "Resolve").
 */
const STATUS_ACTION_LABELS: readonly (readonly [Status, Status, string])[] = [
    ['new', 'noticed', 'Notice'],
    ['noticed', 'progress', 'Claim'],
    ['noticed', 'resolved', 'Resolve'],
    ['progress', 'noticed', 'Release'],
    ['progress', 'resolved', 'Resolve'],
    ['resolved', 'noticed', 'Reopen'],
    ['resolved', 'progress', 'Rollback'],
    ['resolved', 'done', 'Close'],
    ['done', 'resolved', 'Reopen'],
]

function statusDirectionLabel(from: Status, to: Status): string | undefined {
    return STATUS_ACTION_LABELS.find(([a, b]) => a === from && b === to)?.[2]
}

/** Action label for a from→to transition, falling back to the target meta. */
export function statusActionLabel(from: Status, to: Status): string {
    return statusDirectionLabel(from, to) ?? statusAction(to)
}

/** Direction-derived: a target earlier in the lifecycle is a rewind (warning), a forward step success. */
export function statusActionColor(from: Status, to: Status): StatusColor {
    return STATUSES.indexOf(to) < STATUSES.indexOf(from) ? 'warning' : 'success'
}

/**
 * Action icon for a from→to transition. Rollback/Reopen (rewinds) and Release
 * (un-claiming progress) get their own icon - the target meta's icon belongs to
 * the target status, not the move - and Notice (new→noticed) an eye; everything
 * else reuses `statusActionIcon(to)` (Claim falls to progress's forward icon).
 */
export function statusActionIconFor(from: Status, to: Status): string {
    const label = statusActionLabel(from, to)
    if (label === 'Reopen' || label === 'Rollback') return 'i-lucide-rotate-ccw'
    if (label === 'Release') return 'i-lucide-undo-2'
    if (label === 'Notice') return 'i-lucide-eye'
    return statusActionIcon(to)
}

/**
 * Statuses the user may transition to from `currentStatus`, mirroring
 * Report::allowedStatusTargets() on the backend. Developers can target
 * noticed/progress/resolved; reporters/owners can target progress/done.
 * Each is further filtered by the lifecycle chain (canTransitionStatus).
 */
export function allowedStatusTargets(currentStatus: string, role: Role): string[] {
    const candidates: readonly string[] = {
        'guest': [],
        'developer': ['noticed', 'progress', 'resolved'],
        'reporter': ['progress', 'done'],
        'admin': ['noticed', 'progress', 'resolved'],
    }[role]
    return candidates.filter(to => canTransitionStatus(currentStatus as Status, to as Status))
}
