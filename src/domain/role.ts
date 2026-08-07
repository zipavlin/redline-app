// Role
export const ROLES = ['guest', 'reporter', 'developer', 'admin'] as const
export type Role = (typeof ROLES)[number]

/** Derive the isDeveloper/isAdmin booleans from a role. Single source of truth. */
export function roleFlags(role: Role | string): { isDeveloper: boolean; isAdmin: boolean } {
    return {
        isDeveloper: role === 'developer' || role === 'admin',
        isAdmin: role === 'admin',
    }
}
