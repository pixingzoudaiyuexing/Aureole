export type SessionSafetyMarker = 'active' | 'acknowledged'

export const sessionSafetyStorageKeys = {
  commissionTransferUncertainty:
    'aureole.safety.commission-transfer-uncertainty',
} as const

export type SessionSafetyStorageKey =
  (typeof sessionSafetyStorageKeys)[keyof typeof sessionSafetyStorageKeys]

export interface SessionSafetyMarkerRead {
  ok: boolean
  value: SessionSafetyMarker | null
}

export function readSessionSafetyMarker(
  key: SessionSafetyStorageKey,
): SessionSafetyMarkerRead {
  try {
    const value = window.sessionStorage.getItem(key)
    if (value === null) return { ok: true, value: null }
    if (value !== 'active' && value !== 'acknowledged') {
      return { ok: false, value: null }
    }
    return {
      ok: true,
      value,
    }
  } catch {
    return { ok: false, value: null }
  }
}

export function writeSessionSafetyMarker(
  key: SessionSafetyStorageKey,
  value: SessionSafetyMarker,
) {
  try {
    window.sessionStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function clearSessionSafetyMarker(key: SessionSafetyStorageKey) {
  try {
    window.sessionStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function clearSessionSafetyState() {
  let cleared = true
  for (const key of Object.values(sessionSafetyStorageKeys)) {
    if (!clearSessionSafetyMarker(key)) cleared = false
  }
  return cleared
}
