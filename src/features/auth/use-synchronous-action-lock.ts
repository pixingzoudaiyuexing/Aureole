import { useCallback, useMemo, useRef } from 'react'

export function useSynchronousActionLock() {
  const lockedRef = useRef(false)
  const tryAcquire = useCallback(() => {
    if (lockedRef.current) return false
    lockedRef.current = true
    return true
  }, [])
  const release = useCallback(() => {
    lockedRef.current = false
  }, [])

  return useMemo(() => ({ release, tryAcquire }), [release, tryAcquire])
}
