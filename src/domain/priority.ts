/**
 * Priority presentation metadata - shared by widget + dashboard.
 * `color` maps a priority to a Nuxt UI color (UBadge/UButton etc.);
 * `dot` is a Tailwind bg utility for filter/legend dots.
 * Order matches ascending severity (low -> critical); there is no transition
 * graph or role logic - any value is settable at any time.
 */

export const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
export type Priority = (typeof PRIORITIES)[number]

/** Nuxt UI semantic colors. */
export type PriorityColor = 'error' | 'warning' | 'info' | 'success' | 'neutral'

export interface PriorityMeta {
    label: string
    icon: string|null
    color: PriorityColor
    dot: string
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
    low:      { label: 'Low',      icon: null, color: 'neutral', dot: 'bg-neutral' },
    normal:   { label: 'Normal',   icon: null,      color: 'neutral', dot: 'bg-info' },
    high:     { label: 'High',     icon: 'i-lucide-triangle',   color: 'warning', dot: 'bg-warning' },
    critical: { label: 'Critical', icon: 'i-lucide-flame',      color: 'error',   dot: 'bg-error' },
}

export function priorityColor(priority: Priority): PriorityColor {
    return PRIORITY_META[priority]?.color ?? 'neutral'
}

export function priorityLabel(priority: Priority): string {
    return PRIORITY_META[priority]?.label ?? priority
}

export function priorityIcon(priority: Priority): string|null {
    return PRIORITY_META[priority]?.icon ?? null
}
