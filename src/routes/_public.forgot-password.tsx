import { createFileRoute } from '@tanstack/react-router'
import { PasswordRecoveryPage } from '@/features/auth/password-recovery-page'

export const Route = createFileRoute('/_public/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  return <PasswordRecoveryPage />
}
