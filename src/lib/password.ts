/**
 * One password policy for signup, sign-in hints and password changes.
 *
 * Requirement: at least 6 characters, with an uppercase letter, a lowercase
 * letter and a number. No other complexity requirement.
 */
export const PASSWORD_MIN_LENGTH = 6

export function passwordError(value: unknown): string | null {
  const password = typeof value === 'string' ? value : ''
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  }
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter'
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password must include a number'
  return null
}

export function isValidPassword(value: unknown): boolean {
  return passwordError(value) === null
}

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with uppercase, lowercase and a number`
