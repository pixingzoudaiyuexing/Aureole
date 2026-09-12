import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/features/auth/login-page'

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search): { reset?: 'password' } => ({
    reset: search.reset === 'password' ? 'password' : undefined,
  }),
  component: LoginRoutePage,
})

function LoginRoutePage() {
  const search = Route.useSearch()
  return <LoginPage passwordResetSucceeded={search.reset === 'password'} />
}
