export const AUTH_SESSION_STORAGE_KEY = 'aureole.auth.access-token'

export function readSessionCredential() {
  try {
    return window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeSessionCredential(accessToken: string) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, accessToken)
}

export function clearSessionCredential() {
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  } catch {
    // Memory state is still cleared by the caller when storage is unavailable.
  }
}
