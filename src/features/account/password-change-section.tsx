import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useAuth } from '@/features/auth/auth-context'
import { FieldError, MutationFeedback } from '@/features/auth/form-feedback'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import {
  accountApi,
  currentPasswordSchema,
  newAccountPasswordSchema,
} from './account-api'
import {
  getPasswordChangeErrorMessage,
  isAmbiguousAccountMutationError,
} from './account-errors'

interface PasswordChangeFormValues {
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

const passwordChangeFormSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newAccountPasswordSchema,
    confirmNewPassword: z.string(),
  })
  .superRefine((values, context) => {
    if (values.newPassword !== values.confirmNewPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmNewPassword'],
        message: '两次输入的新密码不一致',
      })
    }
  })

export function PasswordChangeSection({
  accessToken,
}: {
  accessToken: string
}) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const actionLock = useSynchronousActionLock()
  const [submissionError, setSubmissionError] = useState<unknown>(null)
  const {
    clearErrors,
    handleSubmit,
    register,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeFormValues>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  })
  const mutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      accountApi.changePassword(accessToken, input),
    retry: false,
  })

  const leaveForLogin = async (
    account: 'password-changed' | 'password-change-uncertain' | undefined,
  ) => {
    reset()
    flushSync(() => {
      logout()
    })
    await navigate({
      to: '/login',
      search: account ? { account } : {},
      replace: true,
    })
  }

  const submit = handleSubmit(async (values) => {
    mutation.reset()
    setSubmissionError(null)
    clearErrors()
    const parsed = passwordChangeFormSchema.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
          setError(field as keyof PasswordChangeFormValues, {
            message: issue.message,
          })
        }
      }
      return
    }
    if (!actionLock.tryAcquire()) return

    try {
      await mutation.mutateAsync({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      })
      await leaveForLogin('password-changed')
    } catch (error) {
      if (isInvalidSessionError(error)) {
        await leaveForLogin(undefined)
        return
      }
      if (isAmbiguousAccountMutationError(error)) {
        await leaveForLogin('password-change-uncertain')
        return
      }
      setSubmissionError(error)
    } finally {
      actionLock.release()
    }
  })

  const busy = isSubmitting || mutation.isPending

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={submit}
      onChange={() => {
        mutation.reset()
        setSubmissionError(null)
        clearErrors()
      }}
      noValidate
    >
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="current-password">
          当前密码
        </label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          maxLength={1024}
          aria-invalid={Boolean(errors.currentPassword)}
          aria-describedby={
            errors.currentPassword ? 'current-password-error' : undefined
          }
          disabled={busy}
          {...register('currentPassword')}
        />
        <FieldError
          id="current-password-error"
          message={errors.currentPassword?.message}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-password">
            新密码
          </label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            maxLength={1024}
            aria-invalid={Boolean(errors.newPassword)}
            aria-describedby={
              errors.newPassword ? 'new-password-error' : undefined
            }
            disabled={busy}
            {...register('newPassword')}
          />
          <FieldError
            id="new-password-error"
            message={errors.newPassword?.message}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="confirm-new-password">
            确认新密码
          </label>
          <Input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            maxLength={1024}
            aria-invalid={Boolean(errors.confirmNewPassword)}
            aria-describedby={
              errors.confirmNewPassword
                ? 'confirm-new-password-error'
                : undefined
            }
            disabled={busy}
            {...register('confirmNewPassword')}
          />
          <FieldError
            id="confirm-new-password-error"
            message={errors.confirmNewPassword?.message}
          />
        </div>
      </div>

      {submissionError ? (
        <MutationFeedback
          error={submissionError}
          message={getPasswordChangeErrorMessage(submissionError)}
        />
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {busy ? '正在修改…' : '修改密码'}
      </Button>
    </form>
  )
}
