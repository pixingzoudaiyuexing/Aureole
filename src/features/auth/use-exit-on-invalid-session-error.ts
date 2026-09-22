import { useEffect } from 'react'
import { isInvalidSessionError } from './auth-errors'
import { useAuth } from './auth-context'
import { isErrorFromCurrentAuthSession } from '@/lib/auth/session-store'

export function useExitOnInvalidSessionError(error: unknown) {
  const { logout } = useAuth()

  useEffect(() => {
    if (isInvalidSessionError(error) && isErrorFromCurrentAuthSession(error)) {
      logout()
    }
  }, [error, logout])
}
