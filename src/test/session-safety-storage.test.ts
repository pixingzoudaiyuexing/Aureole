import { describe, expect, it, vi } from 'vitest'
import {
  clearSessionSafetyMarker,
  clearSessionSafetyState,
  readSessionSafetyMarker,
  sessionSafetyStorageKeys,
  writeSessionSafetyMarker,
} from '@/lib/auth/session-safety-storage'

const safetyKey = sessionSafetyStorageKeys.commissionTransferUncertainty

describe('Session safety storage', () => {
  it.each(['active', 'acknowledged'] as const)(
    'persists only the %s enum marker in sessionStorage',
    (status) => {
      expect(writeSessionSafetyMarker(safetyKey, status)).toBe(true)
      expect(readSessionSafetyMarker(safetyKey)).toEqual({
        ok: true,
        value: status,
      })
      expect(window.sessionStorage.getItem(safetyKey)).toBe(status)
      expect(window.localStorage.getItem(safetyKey)).toBeNull()
    },
  )

  it('fails closed for an unknown serialized value', () => {
    window.sessionStorage.setItem(safetyKey, '1000:CNY:private')
    expect(readSessionSafetyMarker(safetyKey)).toEqual({
      ok: false,
      value: null,
    })
  })

  it('clears one marker or all session safety state', () => {
    writeSessionSafetyMarker(safetyKey, 'active')
    expect(clearSessionSafetyMarker(safetyKey)).toBe(true)
    expect(readSessionSafetyMarker(safetyKey).value).toBeNull()

    writeSessionSafetyMarker(safetyKey, 'acknowledged')
    expect(clearSessionSafetyState()).toBe(true)
    expect(readSessionSafetyMarker(safetyKey).value).toBeNull()
  })

  it('fails closed without exposing storage exceptions', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('private storage detail', 'SecurityError')
    })
    expect(readSessionSafetyMarker(safetyKey)).toEqual({
      ok: false,
      value: null,
    })
  })
})
