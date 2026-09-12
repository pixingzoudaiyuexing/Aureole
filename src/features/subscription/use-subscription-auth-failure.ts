import { useEffect } from 'react'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useAuth } from '@/features/auth/auth-context'

export function useExitOnInvalidSubscriptionError(error: unknown) {
  const { logout } = useAuth()

  useEffect(() => {
    if (isInvalidSessionError(error)) logout()
  }, [error, logout])
}
