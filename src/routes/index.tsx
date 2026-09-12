import { Navigate, createFileRoute } from '@tanstack/react-router'
import {
  AuthBootstrapScreen,
  AuthRecoveryScreen,
} from '@/features/auth/auth-status-screen'
import { useAuth } from '@/features/auth/auth-context'

export const Route = createFileRoute('/')({
  component: RootRoute,
})

function RootRoute() {
  const { status } = useAuth()

  if (status === 'unknown' || status === 'bootstrapping') {
    return <AuthBootstrapScreen />
  }
  if (status === 'error') {
    return <AuthRecoveryScreen />
  }
  return (
    <Navigate
      to={status === 'authenticated' ? '/dashboard' : '/login'}
      replace
    />
  )
}
