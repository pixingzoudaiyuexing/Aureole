import { useCallback, useMemo, useState } from 'react'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'

export type SubscriptionMutationAction = 'rotate-access' | 'advance-period'

export interface SubscriptionMutationCoordinator {
  activeAction: SubscriptionMutationAction | null
  recoveryBlocked: boolean
  tryAcquire: (action: SubscriptionMutationAction) => boolean
  release: () => void
  releaseAfterSessionInvalidation: () => void
  setRecoveryBlocked: (blocked: boolean) => void
}

export function useSubscriptionMutationCoordinator(): SubscriptionMutationCoordinator {
  const actionLock = useSynchronousActionLock()
  const [activeAction, setActiveAction] =
    useState<SubscriptionMutationAction | null>(null)
  const [recoveryBlocked, setRecoveryBlocked] = useState(false)

  const tryAcquire = useCallback(
    (action: SubscriptionMutationAction) => {
      if (recoveryBlocked || !actionLock.tryAcquire()) return false
      setActiveAction(action)
      return true
    },
    [actionLock, recoveryBlocked],
  )

  const release = useCallback(() => {
    setActiveAction(null)
    actionLock.release()
  }, [actionLock])

  const releaseAfterSessionInvalidation = useCallback(() => {
    actionLock.release()
  }, [actionLock])

  return useMemo(
    () => ({
      activeAction,
      recoveryBlocked,
      tryAcquire,
      release,
      releaseAfterSessionInvalidation,
      setRecoveryBlocked,
    }),
    [
      activeAction,
      recoveryBlocked,
      release,
      releaseAfterSessionInvalidation,
      tryAcquire,
    ],
  )
}
