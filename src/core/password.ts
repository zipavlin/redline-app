/**
 * Generate a random password using Web Crypto (crypto.getRandomValues).
 * Used by the dashboard's user-management forms (create + edit).
 */
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'

export function generatePassword(length = 16): string {
    const array = new Uint32Array(length)
    crypto.getRandomValues(array)
    return Array.from(array, n => CHARSET[n % CHARSET.length]).join('')
}
