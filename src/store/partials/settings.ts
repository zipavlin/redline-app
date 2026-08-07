/**
 * Settings slice - presentation preferences persisted to localStorage (config fallback).
 * Shared by both apps; the dashboard only reads `theme` (position/expanded are widget
 * toolbar concepts, harmless when unused).
 */
import { reactive, watch } from 'vue'
import { identity } from '@/core/storage'
import type { RedlineContext } from '@/composables/useApi'

export interface Settings {
    theme: string
    position: string
    expanded: boolean
}

export function settingsSlice(redline?: Partial<RedlineContext>) {
    // State
    const cfg = (redline?.config ?? { theme: 'dark', position: 'bottom-right', expanded: false }) as {
        theme?: string
        position?: string
        expanded?: boolean
    }
    const settings = reactive<Settings>({
        theme: identity.getTheme() ?? cfg.theme ?? 'dark',
        position: identity.getPosition() ?? cfg.position ?? 'bottom-right',
        expanded: identity.isToolbarExpanded() ?? cfg.expanded ?? false,
    })

    // Watchers
    watch(() => settings.theme, theme => identity.saveTheme(theme))
    watch(() => settings.position, position => identity.savePosition(position))
    watch(() => settings.expanded, expanded => identity.saveToolbarExpanded(expanded))

    return { settings }
}
