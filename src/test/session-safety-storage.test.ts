import { describe, expect, it, vi } from 'vitest'
import {
  clearSessionSafetyMarker,
  clearSessionSafetyState,
  readSessionSafetyMarker,
  sessionSafetyStorageKeys,
  writeSessionSafetyMarker,
} from '@/lib/auth/session-safety-storage'

const commissionSafetyKey =
  sessionSafetyStorageKeys.commissionTransferUncertainty
const withdrawalSafetyKey =
  sessionSafetyStorageKeys.withdrawalRequestUncertainty

describe('Session safety storage', () => {
  it.each(['active', 'acknowledged'] as const)(
    'persists only the %s enum marker in sessionStorage',
    (status) => {
      expect(writeSessionSafetyMarker(commissionSafetyKey, status)).toBe(true)
      expect(readSessionSafetyMarker(commissionSafetyKey)).toEqual({
        ok: true,
        value: status,
      })
      expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe(status)
      expect(window.localStorage.getItem(commissionSafetyKey)).toBeNull()
    },
  )

  it('fails closed for an unknown serialized value', () => {
    window.sessionStorage.setItem(commissionSafetyKey, '1000:CNY:private')
    expect(readSessionSafetyMarker(commissionSafetyKey)).toEqual({
      ok: false,
      value: null,
    })
  })

  it('clears one marker or all session safety state', () => {
    writeSessionSafetyMarker(commissionSafetyKey, 'active')
    writeSessionSafetyMarker(withdrawalSafetyKey, 'acknowledged')
    expect(clearSessionSafetyMarker(commissionSafetyKey)).toBe(true)
    expect(readSessionSafetyMarker(commissionSafetyKey).value).toBeNull()
    expect(readSessionSafetyMarker(withdrawalSafetyKey).value).toBe(
      'acknowledged',
    )

    writeSessionSafetyMarker(commissionSafetyKey, 'acknowledged')
    expect(clearSessionSafetyState()).toBe(true)
    expect(readSessionSafetyMarker(commissionSafetyKey).value).toBeNull()
    expect(readSessionSafetyMarker(withdrawalSafetyKey).value).toBeNull()
  })

  it('fails closed without exposing storage exceptions', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('private storage detail', 'SecurityError')
    })
    expect(readSessionSafetyMarker(commissionSafetyKey)).toEqual({
      ok: false,
      value: null,
    })
  })

  it('keeps Commission and Withdrawal marker values independent', () => {
    expect(writeSessionSafetyMarker(commissionSafetyKey, 'active')).toBe(true)
    expect(writeSessionSafetyMarker(withdrawalSafetyKey, 'acknowledged')).toBe(
      true,
    )
    expect(readSessionSafetyMarker(commissionSafetyKey).value).toBe('active')
    expect(readSessionSafetyMarker(withdrawalSafetyKey).value).toBe(
      'acknowledged',
    )

    expect(clearSessionSafetyMarker(withdrawalSafetyKey)).toBe(true)
    expect(readSessionSafetyMarker(commissionSafetyKey).value).toBe('active')
    expect(readSessionSafetyMarker(withdrawalSafetyKey).value).toBeNull()
  })
})
