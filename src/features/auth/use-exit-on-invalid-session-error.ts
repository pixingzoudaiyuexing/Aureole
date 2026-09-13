import { useEffect } from 'react'
import { isInvalidSessionError } from './auth-errors'
import { useAuth } from './auth-context'

export function useExitOnInvalidSessionError(error: unknown) {
  const { logout } = useAuth()

  useEffect(() => {
    if (isInvalidSessionError(error)) logout()
  }, [error, logout])
}
