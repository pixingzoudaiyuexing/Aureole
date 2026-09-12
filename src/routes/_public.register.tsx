import { createFileRoute } from '@tanstack/react-router'
import { AuthPlaceholder } from '@/features/auth/auth-placeholder'

export const Route = createFileRoute('/_public/register')({
  component: RegisterPage,
})

function RegisterPage() {
  return (
    <AuthPlaceholder
      eyebrow="New account"
      title="Create your account"
      description="Registration will use Aureole's public gateway when account onboarding is connected."
      secondaryLabel="Back to sign in"
      secondaryTo="/login"
    />
  )
}
