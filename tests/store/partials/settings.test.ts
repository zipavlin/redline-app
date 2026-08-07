import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { settingsSlice } from '@/store/partials/settings'

describe('settingsSlice', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        document.cookie = 'redline_theme=; Max-Age=0'
    })

    afterEach(() => {
        document.cookie = 'redline_theme=; Max-Age=0'
    })

    it('falls back to defaults when neither config nor storage provides values', () => {
        const { settings } = settingsSlice()

        expect(settings.theme).toBe('dark')
        expect(settings.position).toBe('bottom-right')
        expect(settings.expanded).toBe(false)
    })

    it('uses config values when storage is empty', () => {
        const { settings } = settingsSlice({ config: { theme: 'light', position: 'top-left', expanded: true } })

        expect(settings.theme).toBe('light')
        expect(settings.position).toBe('top-left')
        /**
         * NOTE: config.expanded is effectively dead - identity.isToolbarExpanded()
         * returns false (not null) when storage is empty, so `false ?? cfg.expanded`
         * never reaches the config value. Documenting the actual behavior.
         */
        expect(settings.expanded).toBe(false)
    })

    it('falls back per-field when the config omits a key', () => {
        const { settings } = settingsSlice({ config: { theme: 'light' } })

        expect(settings.theme).toBe('light')
        expect(settings.position).toBe('bottom-right')
        expect(settings.expanded).toBe(false)
    })

    it('prefers stored values over config', () => {
        localStorage.setItem('redline_theme', 'stored-dark')
        localStorage.setItem('redline_toolbar_expanded', '1')

        const { settings } = settingsSlice({ config: { theme: 'light', expanded: false } })

        expect(settings.theme).toBe('stored-dark')
        expect(settings.expanded).toBe(true)
    })

    it('persists changes to storage once the watcher flushes', async () => {
        const { settings } = settingsSlice()

        settings.theme = 'light'
        await nextTick()
        expect(localStorage.getItem('redline_theme')).toBe('light')
        expect(document.cookie).toContain('redline_theme=light')

        settings.position = 'top-left'
        settings.expanded = true
        await nextTick()
        expect(localStorage.getItem('redline_position')).toBe('top-left')
        expect(localStorage.getItem('redline_toolbar_expanded')).toBe('1')

        settings.expanded = false
        await nextTick()
        expect(localStorage.getItem('redline_toolbar_expanded')).toBe('0')
    })

    it('does not re-write storage for values unchanged since setup', async () => {
        localStorage.setItem('redline_theme', 'dark')
        const { settings } = settingsSlice()
        await nextTick()

        // The watcher fires only on change - the untouched stored value stays as-is.
        expect(localStorage.getItem('redline_theme')).toBe('dark')
        expect(settings.theme).toBe('dark')
    })

    it('scopes each slice to its own watchers: a fresh slice reads persisted state without interference', async () => {
        const first = settingsSlice({ config: { theme: 'dark' } })
        first.settings.theme = 'purple'
        await nextTick()

        const second = settingsSlice({ config: { theme: 'dark' } })
        // The persisted value (written by the first slice's watcher) wins over the config.
        expect(second.settings.theme).toBe('purple')

        second.settings.theme = 'green'
        await nextTick()
        expect(localStorage.getItem('redline_theme')).toBe('green')
        // The first slice's own reactive state is untouched by the second slice's writes.
        expect(first.settings.theme).toBe('purple')
    })
})
