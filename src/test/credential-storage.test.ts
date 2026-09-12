import { describe, expect, it } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  clearSessionCredential,
  readSessionCredential,
  writeSessionCredential,
} from '@/lib/auth/credential-storage'

describe('Auth credential storage', () => {
  it('persists only the opaque token in sessionStorage', () => {
    writeSessionCredential('opaque-session-token')

    expect(readSessionCredential()).toBe('opaque-session-token')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'opaque-session-token',
    )
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('clears the session credential', () => {
    writeSessionCredential('opaque-session-token')

    clearSessionCredential()

    expect(readSessionCredential()).toBeNull()
  })
})
