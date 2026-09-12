import { createFileRoute } from '@tanstack/react-router'
import { RegistrationPage } from '@/features/auth/registration-page'

export const Route = createFileRoute('/_public/register')({
  component: RegisterPage,
})

function RegisterPage() {
  return <RegistrationPage />
}
