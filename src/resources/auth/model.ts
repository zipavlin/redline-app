export interface AuthUser {
    id: string
    name: string
    email: string
    role: string
    status?: string
    [key: string]: unknown
}

export interface AuthSuccess {
    token?: string
    user: AuthUser
}

/**
 * GET /auth/me contract: no credentials presented resolves the anonymous body
 * with `user: null` instead of an error. Deliberately NOT the login/register
 * union - those flows must keep requiring a non-nullable user.
 */
export interface AuthMe {
    user: AuthUser | null
}
