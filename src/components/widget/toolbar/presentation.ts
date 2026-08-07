/**
 * Presentation metadata for menu/toggle UIs — label + icon maps for the widget
 * toolbar's filter, pin-position, and appearance menus. These are presentation
 * (not enums/type shapes), so they live in domain/, not types/.
 */

export interface Filter { key: string; label: string; icon: string }
export const FILTERS: Filter[] = [
    { key: 'all', label: 'Show all', icon: 'i-lucide-list' },
    { key: 'unresolved', label: 'Unresolved only', icon: 'i-lucide-circle-dot' },
    { key: 'new', label: 'New only', icon: 'i-lucide-sparkles' },
    { key: 'mine', label: 'Mine only', icon: 'i-lucide-user' },
]

export interface Position { key: string; label: string; icon: string }
export const POSITIONS: Position[] = [
    { key: 'top-left', label: 'Top left', icon: 'i-lucide-arrow-up-left' },
    { key: 'top-right', label: 'Top right', icon: 'i-lucide-arrow-up-right' },
    { key: 'bottom-left', label: 'Bottom left', icon: 'i-lucide-arrow-down-left' },
    { key: 'bottom-right', label: 'Bottom right', icon: 'i-lucide-arrow-down-right' },
]

export interface Appearance { key: string; label: string; icon: string }
export const APPEARANCES: Appearance[] = [
    { key: 'light', label: 'Light', icon: 'i-lucide-sun' },
    { key: 'dark', label: 'Dark', icon: 'i-lucide-moon' },
]
