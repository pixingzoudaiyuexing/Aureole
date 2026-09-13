import { useCallback, useMemo, useState } from 'react'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'

export type WalletMutationAction = 'deposit-create' | 'gift-card-redeem'

export interface WalletMutationCoordinator {
  activeAction: WalletMutationAction | null
  tryAcquire: (action: WalletMutationAction) => boolean
  release: () => void
  releaseAfterSessionInvalidation: () => void
}

export function useWalletMutationCoordinator(): WalletMutationCoordinator {
  const actionLock = useSynchronousActionLock()
  const [activeAction, setActiveAction] = useState<WalletMutationAction | null>(
    null,
  )

  const tryAcquire = useCallback(
    (action: WalletMutationAction) => {
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

  const releaseAfterSessionInvalidation = useCallback(() => {
    actionLock.release()
  }, [actionLock])

  return useMemo(
    () => ({
      activeAction,
      release,
      releaseAfterSessionInvalidation,
      tryAcquire,
    }),
    [activeAction, release, releaseAfterSessionInvalidation, tryAcquire],
  )
}
