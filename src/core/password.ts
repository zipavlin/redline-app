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

/** Advisory password-strength verdict shown by the registration/user forms. */
export interface PasswordStrength {
    /** 0 (empty) to 4 (long + varied). */
    score: number
    /** Meter label - e.g. "Weak" / "Strong"; empty when the password is empty. */
    label: string
    /** Nuxt UI color token name the meter segments are tinted with. */
    color: 'error' | 'warning' | 'success'
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLORS: PasswordStrength['color'][] = ['error', 'error', 'warning', 'success', 'success']

/**
 * Score a password by length (2 pts ≥ 12 chars, 1 pt ≥ 8) plus character-class
 * variety (2 pts for 3+ classes, 1 pt for 2), clamped to 1–4 for any non-empty
 * input. Pure and advisory only - the backend enforces its own rules.
 */
export function passwordStrength(password: string): PasswordStrength {
    if (!password) return { score: 0, label: '', color: 'error' }
    const lengthScore = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0
    const classCount = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(regex => regex.test(password)).length
    const varietyScore = classCount >= 3 ? 2 : classCount >= 2 ? 1 : 0
    const score = Math.max(1, Math.min(4, lengthScore + varietyScore))
    return { score, label: STRENGTH_LABELS[score], color: STRENGTH_COLORS[score] }
}
