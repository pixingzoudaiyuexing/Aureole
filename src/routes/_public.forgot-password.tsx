import { createFileRoute } from '@tanstack/react-router'
import { AuthPlaceholder } from '@/features/auth/auth-placeholder'

export const Route = createFileRoute('/_public/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  return (
    <AuthPlaceholder
      eyebrow="Account recovery"
      title="Reset your password"
      description="Secure password recovery will be available with the authentication milestone."
      secondaryLabel="Back to sign in"
      secondaryTo="/login"
    />
  )
}
