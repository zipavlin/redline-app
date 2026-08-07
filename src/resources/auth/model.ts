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
