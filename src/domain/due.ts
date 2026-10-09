/**
 * Due-date presentation metadata - shared by widget + dashboard.
 *
 * Presentation states are DERIVED from the raw `due_at` timestamp + the report
 * status against a reference `now`, so the same stored UTC value renders as the
 * right chip wherever it is shown. This module is deliberately pure (domain/ is
 * a leaf): the full tooltip (local datetime + "overdue" suffix) is composed in
 * components, which may read core/ helpers - this file must not.
 *
 * State gating (see the plan's "Decided"):
 * - no deadline -> `none`
 * - closed report (resolved|done) -> `parked`: a stale deadline never alarms
 * - open report -> `overdue` (past), `due_soon` (within DUE_SOON_MS), else `later`
 */
import { isClosedStatus, type Status } from '@/domain/status'

export type DueState = 'none' | 'overdue' | 'due_soon' | 'later' | 'parked'

/** Nuxt UI semantic colors. */
export type DueColor = 'neutral' | 'warning' | 'error'

interface DueMeta {
    icon: string
    color: DueColor
}

/**
 * Meta keyed by the four PRESENTATION states (not the full DueState union):
 * `later` and `parked` both render as the plain clock, so they share `set`.
 */
const DUE_META: Record<'none' | 'set' | 'due_soon' | 'overdue', DueMeta> = {
    none:     { icon: 'i-lucide-clock-fading', color: 'neutral' },
    set:      { icon: 'i-lucide-clock',        color: 'neutral' },
    due_soon: { icon: 'i-lucide-clock-alert',  color: 'warning' },
    overdue:  { icon: 'i-lucide-clock-alert',  color: 'error' },
}

/** Window (ms) within which an open report's deadline counts as "due soon". */
export const DUE_SOON_MS = 24 * 60 * 60 * 1000

/**
 * A due date is usable only when it parses; the wire is normalized UTC, but a
 * corrupt value must not reach Intl formatting (which throws on an invalid date).
 */
export function isDueAtUsable(dueAt: string | null | undefined): dueAt is string {
    return typeof dueAt === 'string' && dueAt.length > 0 && !Number.isNaN(Date.parse(dueAt))
}

/** Map every DueState onto its presentation meta; `later`/`parked` fold onto `set`. */
const DUE_STATE_META: Record<DueState, DueMeta> = {
    none:     DUE_META.none,
    later:    DUE_META.set,
    parked:   DUE_META.set,
    due_soon: DUE_META.due_soon,
    overdue:  DUE_META.overdue,
}

export function dueState(dueAt: string | null | undefined, status: string, now: number = Date.now()): DueState {
    if (!dueAt) return 'none'
    if (isClosedStatus(status as Status)) return 'parked'
    if (!isDueAtUsable(dueAt)) return 'none'
    const due = Date.parse(dueAt)
    if (due < now) return 'overdue'
    if (due < now + DUE_SOON_MS) return 'due_soon'
    return 'later'
}

/**
 * Compact magnitude label, floored to the largest whole unit (m/h/d/w).
 * The ABSOLUTE distance is used, so an overdue deadline keeps the same
 * magnitude ("3d") - the red clock-alert carries the overdue meaning.
 */
export function dueShortLabel(dueAt: string, now: number = Date.now()): string {
    if (!isDueAtUsable(dueAt)) return ''
    const parsed = Date.parse(dueAt)
    const distance = Math.abs(parsed - now)
    const minutes = Math.floor(distance / 60_000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(distance / 3_600_000)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(distance / 86_400_000)
    if (days < 7) return `${days}d`
    return `${Math.floor(days / 7)}w`
}

export function dueColor(state: DueState): DueColor {
    return DUE_STATE_META[state]?.color ?? DUE_META.none.color
}

export function dueIcon(state: DueState): string {
    return DUE_STATE_META[state]?.icon ?? DUE_META.none.icon
}
