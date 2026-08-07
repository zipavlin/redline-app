/**
 * Auth slice — shared by the widget and dashboard stores. Owns reactive `auth`
 * state, session bootstrap (via GET /auth/me, cookies sent automatically in
 * cookie mode), and post-auth activation. Depends only on the injected
 * `redline` context (for `redline.api.auth.*`).
 */
import { nextTick, reactive } from 'vue'
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
    const auth = reactive<AuthState>({
        user: null,
        callback: null,
        authView: 'login',
    })

    // Pre-populate synchronously from cache so the full UI renders immediately on refresh.
    const cachedUser = identity.getUser()
    if (cachedUser) {
        auth.user = toAuthUser(cachedUser as unknown as AuthUser)
    }

    // Async session check — skipped when already verified this browser session.
    async function _initAuth() {
        if (identity.isTokenVerified()) return

        try {
            const result = await redline.api.auth.me()
            if (result.ok && result.data?.user) {
                const user = result.data.user
                auth.user = toAuthUser(user)

                if (identity.isRememberMe()) {
                    try {
                        const refreshResult = await redline.api.auth.refresh()
                        // Cloud mode returns a fresh access token; local cookie mode
                        // returns none — pass it through only when present.
                        if (refreshResult.ok && refreshResult.data?.token) {
                            identity.saveUser(user.name, user.email, user.role, refreshResult.data.token, user.id)
                        }
                    } catch { /* keep current session on network failure */ }
                }

                identity.markTokenVerified()
            } else if (result.status === 401) {
                identity.clearUser()
                identity.clearTokenVerified()
                auth.user = null
            }
        } catch { /* keep cached state on network failure — do not mark verified */ }
    }
    nextTick(_initAuth)

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
