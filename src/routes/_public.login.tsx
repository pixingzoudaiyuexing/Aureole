import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/features/auth/login-page'

export const Route = createFileRoute('/_public/login')({
  validateSearch: (
    search,
  ): {
    reset?: 'password'
    account?: 'password-changed' | 'password-change-uncertain'
  } => ({
    reset: search.reset === 'password' ? 'password' : undefined,
    account:
      search.account === 'password-changed' ||
      search.account === 'password-change-uncertain'
        ? search.account
        : undefined,
  }),
  component: LoginRoutePage,
})

function LoginRoutePage() {
  const search = Route.useSearch()
  return (
    <LoginPage
      passwordResetSucceeded={search.reset === 'password'}
      accountNotice={search.account}
    />
  )
}
