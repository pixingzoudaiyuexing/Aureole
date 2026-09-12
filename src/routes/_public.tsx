import { Navigate, createFileRoute } from '@tanstack/react-router'
import { PublicLayout } from '@/components/layout/public-layout'
import {
  AuthBootstrapScreen,
  AuthRecoveryScreen,
} from '@/features/auth/auth-status-screen'
import { useAuth } from '@/features/auth/auth-provider'

export const Route = createFileRoute('/_public')({
  component: PublicAuthRoute,
})

function PublicAuthRoute() {
  const { status } = useAuth()

  if (status === 'unknown' || status === 'bootstrapping') {
    return <AuthBootstrapScreen />
  }
  if (status === 'error') {
    return <AuthRecoveryScreen />
  }
  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />
  }
  return <PublicLayout />
}
