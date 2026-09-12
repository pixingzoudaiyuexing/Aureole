import { createFileRoute } from '@tanstack/react-router'
import { AuthPlaceholder } from '@/features/auth/auth-placeholder'

export const Route = createFileRoute('/_public/login')({
  component: LoginPage,
})

function LoginPage() {
  return (
    <AuthPlaceholder
      eyebrow="Welcome back"
      title="Sign in to Aureole"
      description="Access your subscription, orders, wallet, and support in one place."
      secondaryLabel="Create an account"
      secondaryTo="/register"
    />
  )
}
