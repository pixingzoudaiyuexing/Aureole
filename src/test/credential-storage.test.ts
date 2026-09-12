import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  clearSessionCredential,
  readSessionCredential,
  writeSessionCredential,
} from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

describe('Auth credential storage', () => {
  it('persists only the opaque token in sessionStorage', () => {
    expect(writeSessionCredential('opaque-session-token')).toBe(true)

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

  it('falls back to memory when sessionStorage write fails', () => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (this === window.sessionStorage && key === AUTH_SESSION_STORAGE_KEY) {
        throw new DOMException('Storage disabled', 'SecurityError')
      }
      return originalSetItem.call(this, key, value)
    })

    expect(() =>
      useAuthSessionStore.getState().setAccessToken('memory-only-token'),
    ).not.toThrow()
    expect(useAuthSessionStore.getState().accessToken).toBe('memory-only-token')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('becomes unauthenticated on new hydration without readable storage', () => {
    useAuthSessionStore.setState({
      accessToken: 'memory-only-token',
      hydrated: true,
    })

    useAuthSessionStore.setState({ accessToken: null, hydrated: false })
    useAuthSessionStore.getState().hydrate()

    expect(useAuthSessionStore.getState()).toMatchObject({
      accessToken: null,
      hydrated: true,
    })
  })
})
