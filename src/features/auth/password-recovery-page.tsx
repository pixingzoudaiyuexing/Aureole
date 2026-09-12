import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getLifecycleErrorMessage } from './account-lifecycle-errors'
import {
  ChallengeField,
  type ChallengeFieldHandle,
} from './challenge/challenge-field'
import { FieldError, MutationFeedback } from './form-feedback'
import { useOnboardingConfig } from './onboarding-query'
import { OnboardingError, OnboardingLoading } from './onboarding-state'
import {
  accountEmailCodeSchema,
  accountEmailSchema,
  accountPasswordSchema,
  publicAccountApi,
  type OnboardingConfig,
} from './public-account-api'

interface RecoveryFormValues {
  email: string
  emailCode: string
  newPassword: string
  confirmNewPassword: string
}

const recoverySchema = z
  .object({
    email: accountEmailSchema,
    emailCode: accountEmailCodeSchema,
    newPassword: accountPasswordSchema,
    confirmNewPassword: z.string(),
  })
  .superRefine((values, context) => {
    if (values.newPassword !== values.confirmNewPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmNewPassword'],
        message: '两次输入的密码不一致',
      })
    }
  })

export function PasswordRecoveryPage() {
  const onboarding = useOnboardingConfig()

  if (onboarding.isPending) return <OnboardingLoading />
  if (onboarding.isError) {
    return <OnboardingError retry={() => void onboarding.refetch()} />
  }

  return <RecoveryForm config={onboarding.data} />
}

function RecoveryForm({ config }: { config: OnboardingConfig }) {
  const navigate = useNavigate()
  const challengeRef = useRef<ChallengeFieldHandle>(null)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [challengeError, setChallengeError] = useState<string | null>(null)
  const [codeSent, setCodeSent] = useState(false)
  const [emailCodeError, setEmailCodeError] = useState<unknown>(null)
  const [passwordResetError, setPasswordResetError] = useState<unknown>(null)
  const {
    clearErrors,
    getValues,
    handleSubmit,
    register,
    setError,
    setValue,
    formState: { errors },
  } = useForm<RecoveryFormValues>({
    defaultValues: {
      email: '',
      emailCode: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  })

  const emailCodeMutation = useMutation({
    mutationFn: (input: Parameters<typeof publicAccountApi.sendEmailCode>[0]) =>
      publicAccountApi.sendEmailCode(input),
    retry: false,
    gcTime: 0,
  })
  const resetMutation = useMutation({
    mutationFn: (input: Parameters<typeof publicAccountApi.resetPassword>[0]) =>
      publicAccountApi.resetPassword(input),
    retry: false,
    gcTime: 0,
  })

  const resetConsumedChallenge = () => {
    setChallengeToken(null)
    challengeRef.current?.reset()
  }

  const sendEmailCode = async () => {
    emailCodeMutation.reset()
    setEmailCodeError(null)
    clearErrors('email')
    const email = accountEmailSchema.safeParse(getValues('email'))
    if (!email.success) {
      setError('email', { message: email.error.issues[0]?.message })
      return
    }
    if (config.antiBot.state === 'unsupported') return
    if (config.antiBot.state === 'supported' && !challengeToken) {
      setChallengeError('请先完成人机验证')
      return
    }

    const tokenToConsume = challengeToken
    try {
      await emailCodeMutation.mutateAsync({
        email: email.data,
        purpose: 'password-reset',
        ...(tokenToConsume ? { challengeToken: tokenToConsume } : {}),
      })
      setCodeSent(true)
    } catch (error) {
      setCodeSent(false)
      setEmailCodeError(error)
    } finally {
      if (tokenToConsume) resetConsumedChallenge()
      emailCodeMutation.reset()
    }
  }

  const submit = handleSubmit(async (values) => {
    resetMutation.reset()
    setPasswordResetError(null)
    clearErrors()
    const parsed = recoverySchema.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
          setError(field as keyof RecoveryFormValues, {
            message: issue.message,
          })
        }
      }
      return
    }

    try {
      await resetMutation.mutateAsync({
        email: parsed.data.email,
        emailCode: parsed.data.emailCode,
        newPassword: parsed.data.newPassword,
      })
      await navigate({
        to: '/login',
        search: { reset: 'password' },
        replace: true,
      })
    } catch (error) {
      setPasswordResetError(error)
    } finally {
      resetMutation.reset()
    }
  })

  const emailField = register('email')
  const busy = emailCodeMutation.isPending || resetMutation.isPending
  const challengeBlocked = config.antiBot.state === 'unsupported'

  return (
    <section className="w-full max-w-[30rem]" aria-labelledby="recovery-title">
      <span className="flex size-11 items-center justify-center rounded-md bg-secondary text-primary">
        <KeyRound className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-7 text-xs font-semibold uppercase text-primary">
        账号恢复
      </p>
      <h1 id="recovery-title" className="mt-2 text-3xl font-semibold">
        重置密码
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        获取邮箱验证码后设置一个新密码。
      </p>

      <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="recovery-email">
            邮箱
          </label>
          <Input
            id="recovery-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'recovery-email-error' : undefined}
            disabled={busy}
            {...emailField}
            onChange={(event) => {
              emailField.onChange(event)
              setCodeSent(false)
              setValue('emailCode', '')
              clearErrors('email')
              emailCodeMutation.reset()
              setEmailCodeError(null)
            }}
          />
          <FieldError
            id="recovery-email-error"
            message={errors.email?.message}
          />
        </div>

        <ChallengeField
          ref={challengeRef}
          capability={config.antiBot}
          onTokenChange={(token) => {
            setChallengeToken(token)
            if (token) setChallengeError(null)
          }}
        />
        {challengeError ? (
          <p className="text-sm text-destructive" role="alert">
            {challengeError}
          </p>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <label
              className="text-sm font-medium"
              htmlFor="recovery-email-code"
            >
              邮箱验证码
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || challengeBlocked}
              onClick={sendEmailCode}
            >
              {emailCodeMutation.isPending ? '正在发送…' : '发送验证码'}
            </Button>
          </div>
          <Input
            id="recovery-email-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-invalid={Boolean(errors.emailCode)}
            aria-describedby={
              errors.emailCode ? 'recovery-code-error' : undefined
            }
            disabled={busy}
            {...register('emailCode')}
          />
          <FieldError
            id="recovery-code-error"
            message={errors.emailCode?.message}
          />
          {codeSent ? (
            <p className="text-sm text-primary" role="status">
              验证码已发送
            </p>
          ) : null}
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
            <label
              className="text-sm font-medium"
              htmlFor="confirm-new-password"
            >
              确认新密码
            </label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
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

        {emailCodeError ? (
          <MutationFeedback
            error={emailCodeError}
            message={getLifecycleErrorMessage(emailCodeError, 'email-code')}
          />
        ) : null}
        {passwordResetError ? (
          <MutationFeedback
            error={passwordResetError}
            message={getLifecycleErrorMessage(
              passwordResetError,
              'password-reset',
            )}
          />
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={busy || challengeBlocked}
        >
          {resetMutation.isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {resetMutation.isPending ? '正在重置…' : '重置密码'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        想起密码了？{' '}
        <Link
          to="/login"
          className="rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          返回登录
        </Link>
      </p>
    </section>
  )
}
