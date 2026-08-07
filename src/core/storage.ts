/**
 * Identity + preference storage facade. Browser I/O (localStorage / sessionStorage /
 * cookies), so it lives in core/. The exported object keeps the name `identity` - it
 * is the identity/preferences facade; the file name (storage) is the mechanism.
 *
 * The local same-origin session token is HttpOnly (server-set `redline_token` cookie),
 * so JS never reads or writes it. A cloud access token (Bearer auth) may be held in
 * sessionStorage; non-sensitive user data and preferences remain in localStorage.
 */
import { roleFlags } from '@/domain/role'
import type { Role } from '@/domain/role'

export interface StoredUser {
    id: string | null
    name: string
    email: string
    role: Role | string
    isDeveloper: boolean
    isAdmin: boolean
}

const KEY = {
    id:              'redline_id',
    name:            'redline_name',
    email:           'redline_email',
    role:            'redline_role',
    rememberMe:      'redline_remember_me',
    theme:           'redline_theme',
    position:        'redline_position',
    toolbarExpanded: 'redline_toolbar_expanded',
} as const

const SESSION_KEY = {
    verifiedToken: 'redline_session_verified',
    cloudToken:    'redline_cloud_token',
} as const

const ls = {
    get:    (key: string): string | null => { try { return localStorage.getItem(key) } catch { return null } },
    set:    (key: string, val: string): void => { try { localStorage.setItem(key, val) } catch { /* Ignore */ } },
    remove: (key: string): void => { try { localStorage.removeItem(key) } catch { /* Ignore */ } },
}

const session = {
    get:    (key: string): string | null => { try { return sessionStorage.getItem(key) } catch { return null } },
    set:    (key: string, val: string): void => { try { sessionStorage.setItem(key, val) } catch { /* Ignore */ } },
    remove: (key: string): void => { try { sessionStorage.removeItem(key) } catch { /* Ignore */ } },
}

const cookie = {
    set(name: string, value: string, maxAge: number): void {
        document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}`
    },
}

export const identity = {
    // Auth / identity
    getUser(): StoredUser | null {
        const id    = ls.get(KEY.id) || null
        const name  = ls.get(KEY.name) || ''
        const email = ls.get(KEY.email) || ''
        const role  = ls.get(KEY.role) || 'reporter'
        if (!name || !email) return null
        return { id, name, email, role, ...roleFlags(role) }
    },

    saveUser(name: string, email: string, role: string, token?: string, id?: string): void {
        ls.set(KEY.name, name)
        ls.set(KEY.email, email)
        ls.set(KEY.role, role)
        if (id) ls.set(KEY.id, id)
        if (token) session.set(SESSION_KEY.cloudToken, token)
    },

    /** Cloud access token (Bearer auth). Local cookie mode never stores one → null. */
    getToken(): string | null {
        return session.get(SESSION_KEY.cloudToken)
    },

    clearUser(): void {
        ls.remove(KEY.name)
        ls.remove(KEY.email)
        ls.remove(KEY.role)
        ls.remove(KEY.rememberMe)
        session.remove(SESSION_KEY.cloudToken)
    },

    isRememberMe(): boolean {
        return ls.get(KEY.rememberMe) === '1'
    },

    saveRememberMe(rememberMe: boolean): void {
        ls.set(KEY.rememberMe, rememberMe ? '1' : '0')
    },

    hasUser(): boolean {
        return !!(ls.get(KEY.name) && ls.get(KEY.email))
    },

    // Session verification cache
    isTokenVerified(): boolean {
        return session.get(SESSION_KEY.verifiedToken) === '1'
    },

    markTokenVerified(): void {
        session.set(SESSION_KEY.verifiedToken, '1')
    },

    clearTokenVerified(): void {
        session.remove(SESSION_KEY.verifiedToken)
    },

    // Presentation preferences
    getTheme(): string | null {
        return ls.get(KEY.theme) || null
    },

    saveTheme(theme: string): void {
        ls.set(KEY.theme, theme)
        cookie.set('redline_theme', theme, 60 * 60 * 24 * 365)
    },

    getPosition(): string | null {
        return ls.get(KEY.position) || null
    },

    savePosition(position: string): void {
        ls.set(KEY.position, position)
    },

    isToolbarExpanded(): boolean {
        return ls.get(KEY.toolbarExpanded) === '1'
    },

    saveToolbarExpanded(expanded: boolean): void {
        ls.set(KEY.toolbarExpanded, expanded ? '1' : '0')
    },
}
