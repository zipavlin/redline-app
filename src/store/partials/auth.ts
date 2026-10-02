/**
 * Auth slice - shared by the widget and dashboard stores. Owns reactive `auth`
 * state, session bootstrap (via GET /auth/me, cookies sent automatically in
 * cookie mode), and post-auth activation. Depends only on the injected
 * `redline` context (for `redline.api.auth.*`).
 */
import { nextTick, reactive, watch } from 'vue'
import { identity } from '@/core/storage'
import { roleFlags } from '@/domain/role'
import type { RedlineContext } from '@/composables/useApi'
import type { AuthUser } from '@/resources/auth/model'

export interface AuthState {
    user: (AuthUser & { isDeveloper: boolean; isAdmin: boolean }) | null
    callback: (() => void) | null
    authView: 'login' | 'register'
}

function toAuthUser(user: AuthUser): NonNullable<AuthState['user']> {
    return {
        ...user,
        ...roleFlags(user.role),
    }
}

export function authSlice(redline: RedlineContext) {
    // State
    const auth = reactive<AuthState>({
        user: null,
        callback: null,
        authView: 'login',
    })

    /**
     * Session-check status and the once-per-mount exchange guard live in this
     * closure so each store gets its own. `unknown` until GET /auth/me settles.
     */
    let sessionStatus: 'unknown' | 'absent' | 'active' = 'unknown'
    let exchangeAttempted = false

    // Pre-populate synchronously from cache so the full UI renders immediately on refresh.
    const cachedUser = identity.getUser()
    if (cachedUser) {
        auth.user = toAuthUser(cachedUser as unknown as AuthUser)
    }

    // Functions
    /**
     * Async session check - always runs on mount, so a cached user alone can
     * never fake an authenticated session when the cookie has died. The
     * remember-me refresh stays throttled to once per tab (the verified flag
     * now means "refresh already done this tab"); GET /auth/me itself is cheap
     * and restores trust in the cached identity.
     */
    async function _initAuth() {
        try {
            const result = await redline.api.auth.me()
            if (result.ok && result.data?.user) {
                sessionStatus = 'active'
                const user = result.data.user
                auth.user = toAuthUser(user)
                await _refreshRememberedSession(user)
                identity.markTokenVerified()
            } else if (result.status === 401) {
                identity.clearUser()
                identity.clearTokenVerified()
                auth.user = null
                sessionStatus = 'absent'
                void _exchangeHostSession()
            }
        } catch { /** Keep cached state on network failure - do not mark verified */ }
    }
    nextTick(_initAuth)

    /**
     * Refresh a remember-me session once per tab and persist any fresh access
     * token. Cloud mode returns one; local cookie mode returns none, so it is
     * passed through only when present. Called before the verified flag is set,
     * so a second mount in the same tab skips this.
     */
    async function _refreshRememberedSession(user: AuthUser) {
        if (!identity.isRememberMe() || identity.isTokenVerified()) return
        try {
            const refreshResult = await redline.api.auth.refresh()
            if (refreshResult.ok && refreshResult.data?.token) {
                identity.saveUser(user.name, user.email, user.role, refreshResult.data.token, user.id)
            }
        } catch { /** Keep the current session on network failure */ }
    }

    /**
     * Host-session mode: exchange the host application session for a redline
     * session. Cookie transport only (the host session cookie only exists
     * same-origin), once per mount, and entirely silent - a failure just leaves
     * the visitor unauthenticated.
     */
    async function _exchangeHostSession() {
        if (exchangeAttempted) return
        if (redline.config.loginMode !== 'session') return
        if (redline.config.cookieTransport !== true) return

        exchangeAttempted = true
        try {
            const result = await redline.api.auth.login({})
            if (result.ok && result.status !== 202 && result.data?.user) activateSession(result.data.user)
        } catch { /** Silent: nothing to recover, the visitor stays logged out */ }
    }

    /**
     * The Widget creates its store synchronously while `fetchBootstrap` resolves
     * later over the network, so `_initAuth` finishes before `loginMode: 'session'`
     * lands on the (reactive) config - this watch fires the exchange then. The
     * Dashboard applies bootstrap before creating the store, covered by `immediate`.
     */
    watch(
        () => redline.config.loginMode,
        mode => {
            if (mode === 'session' && sessionStatus === 'absent') void _exchangeHostSession()
        },
        { immediate: true },
    )

    // Shared post-auth logic called by both login and register flows.
    function activateSession(user: AuthUser, token?: string, { rememberMe }: { rememberMe?: boolean } = {}) {
        identity.saveUser(user.name, user.email, user.role, token, user.id)
        if (rememberMe !== undefined) identity.saveRememberMe(rememberMe)
        identity.markTokenVerified()
        auth.user = toAuthUser(user)
        const callback = auth.callback
        auth.callback = null
        callback?.()
    }

    return { auth, activateSession }
}
