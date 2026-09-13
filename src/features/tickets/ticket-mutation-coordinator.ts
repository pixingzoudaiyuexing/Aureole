import { useCallback, useMemo, useState } from 'react'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'

export type TicketMutationAction = 'reply' | 'close'

export function useTicketMutationCoordinator() {
  const actionLock = useSynchronousActionLock()
  const [activeAction, setActiveAction] = useState<TicketMutationAction | null>(
    null,
  )

  const tryAcquire = useCallback(
    (action: TicketMutationAction) => {
      if (!actionLock.tryAcquire()) return false
      setActiveAction(action)
      return true
    },
    [actionLock],
  )

  const release = useCallback(() => {
    setActiveAction(null)
    actionLock.release()
  }, [actionLock])

  return useMemo(
    () => ({ activeAction, release, tryAcquire }),
    [activeAction, release, tryAcquire],
  )
}
