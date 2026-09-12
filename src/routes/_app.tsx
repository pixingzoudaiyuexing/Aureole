import { Navigate, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app-shell'
import {
  AuthBootstrapScreen,
  AuthRecoveryScreen,
} from '@/features/auth/auth-status-screen'
import { useAuth } from '@/features/auth/auth-context'

export const Route = createFileRoute('/_app')({
  component: ProtectedAppRoute,
})

function ProtectedAppRoute() {
  const { status } = useAuth()

  if (status === 'unknown' || status === 'bootstrapping') {
    return <AuthBootstrapScreen />
  }
  if (status === 'error') {
    return <AuthRecoveryScreen />
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  return <AppShell />
}
