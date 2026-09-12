import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LoaderCircle, UserPlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getLifecycleErrorMessage } from './account-lifecycle-errors'
import { useAuth } from './auth-context'
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
  accountInviteCodeSchema,
  accountPasswordSchema,
  publicAccountApi,
  type OnboardingConfig,
} from './public-account-api'

interface RegistrationFormValues {
  email: string
  password: string
  confirmPassword: string
  emailCode: string
  inviteCode: string
  termsAccepted: boolean
}

function registrationSchema(config: OnboardingConfig) {
  return z
    .object({
      email: accountEmailSchema,
      password: accountPasswordSchema,
      confirmPassword: z.string(),
      emailCode: z.string(),
      inviteCode: z.string().max(255, '邀请码不能超过 255 个字符'),
      termsAccepted: z.boolean(),
    })
    .superRefine((values, context) => {
      if (values.password !== values.confirmPassword) {
        context.addIssue({
          code: 'custom',
          path: ['confirmPassword'],
          message: '两次输入的密码不一致',
        })
      }
      if (
        config.emailVerificationRequired &&
        !accountEmailCodeSchema.safeParse(values.emailCode).success
      ) {
        context.addIssue({
          code: 'custom',
          path: ['emailCode'],
          message: '请输入 6 位数字验证码',
        })
      }
      if (
        config.inviteCodeRequired &&
        !accountInviteCodeSchema.safeParse(values.inviteCode).success
      ) {
        context.addIssue({
          code: 'custom',
          path: ['inviteCode'],
          message: '请输入邀请码',
        })
      }
      if (config.termsUrl && !values.termsAccepted) {
        context.addIssue({
          code: 'custom',
          path: ['termsAccepted'],
          message: '请阅读并同意服务条款',
        })
      }
    })
}

export function RegistrationPage() {
  const onboarding = useOnboardingConfig()

  if (onboarding.isPending) return <OnboardingLoading />
  if (onboarding.isError) {
    return <OnboardingError retry={() => void onboarding.refetch()} />
  }

  return <RegistrationForm config={onboarding.data} />
}

function RegistrationForm({ config }: { config: OnboardingConfig }) {
  const navigate = useNavigate()
  const { establishSession } = useAuth()
  const challengeRef = useRef<ChallengeFieldHandle>(null)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [challengeError, setChallengeError] = useState<string | null>(null)
  const [codeSent, setCodeSent] = useState(false)
  const [emailCodeError, setEmailCodeError] = useState<unknown>(null)
  const [registrationError, setRegistrationError] = useState<unknown>(null)
  const {
    clearErrors,
    getValues,
    handleSubmit,
    register,
    setError,
    setValue,
    formState: { errors },
  } = useForm<RegistrationFormValues>({
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      emailCode: '',
      inviteCode: '',
      termsAccepted: false,
    },
  })

  const emailCodeMutation = useMutation({
    mutationFn: (input: Parameters<typeof publicAccountApi.sendEmailCode>[0]) =>
      publicAccountApi.sendEmailCode(input),
    retry: false,
    gcTime: 0,
  })
  const registerMutation = useMutation({
    mutationFn: async (
      input: Parameters<typeof publicAccountApi.register>[0],
    ) => {
      const result = await publicAccountApi.register(input)
      return establishSession(result.accessToken)
    },
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
        purpose: 'register',
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
    registerMutation.reset()
    setRegistrationError(null)
    clearErrors()
    const parsed = registrationSchema(config).safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
          setError(field as keyof RegistrationFormValues, {
            message: issue.message,
          })
        }
      }
      return
    }
    if (config.antiBot.state === 'unsupported') return
    if (config.antiBot.state === 'supported' && !challengeToken) {
      setChallengeError('请先完成人机验证')
      return
    }

    const tokenToConsume = challengeToken
    const inviteCode = parsed.data.inviteCode.trim()
    try {
      await registerMutation.mutateAsync({
        email: parsed.data.email,
        password: parsed.data.password,
        ...(config.emailVerificationRequired
          ? { emailCode: parsed.data.emailCode }
          : {}),
        ...(inviteCode ? { inviteCode } : {}),
        ...(tokenToConsume ? { challengeToken: tokenToConsume } : {}),
      })
      await navigate({ to: '/dashboard', replace: true })
    } catch (error) {
      setRegistrationError(error)
    } finally {
      if (tokenToConsume) resetConsumedChallenge()
      registerMutation.reset()
    }
  })

  const emailField = register('email')
  const busy = emailCodeMutation.isPending || registerMutation.isPending
  const challengeBlocked = config.antiBot.state === 'unsupported'

  return (
    <section className="w-full max-w-[30rem]" aria-labelledby="register-title">
      <span className="flex size-11 items-center justify-center rounded-md bg-secondary text-primary">
        <UserPlus className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-7 text-xs font-semibold uppercase text-primary">
        创建账号
      </p>
      <h1 id="register-title" className="mt-2 text-3xl font-semibold">
        注册 Aureole
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        按当前服务要求完成账号注册。
      </p>

      <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="register-email">
            邮箱
          </label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
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
            id="register-email-error"
            message={errors.email?.message}
          />
          {config.emailSuffixWhitelist ? (
            <p className="text-xs leading-5 text-muted-foreground">
              允许的邮箱后缀：{config.emailSuffixWhitelist.join('、')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="register-password">
              密码
            </label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'register-password-error' : undefined
              }
              disabled={busy}
              {...register('password')}
            />
            <FieldError
              id="register-password-error"
              message={errors.password?.message}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="confirm-password">
              确认密码
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword ? 'confirm-password-error' : undefined
              }
              disabled={busy}
              {...register('confirmPassword')}
            />
            <FieldError
              id="confirm-password-error"
              message={errors.confirmPassword?.message}
            />
          </div>
        </div>

        {config.emailVerificationRequired ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <label
                className="text-sm font-medium"
                htmlFor="register-email-code"
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
              id="register-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-invalid={Boolean(errors.emailCode)}
              aria-describedby={
                errors.emailCode ? 'register-code-error' : undefined
              }
              disabled={busy}
              {...register('emailCode')}
            />
            <FieldError
              id="register-code-error"
              message={errors.emailCode?.message}
            />
            {codeSent ? (
              <p className="text-sm text-primary" role="status">
                验证码已发送
                {config.antiBot.state === 'supported'
                  ? '，提交注册前请再次完成人机验证。'
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="invite-code">
            邀请码{config.inviteCodeRequired ? '' : '（可选）'}
          </label>
          <Input
            id="invite-code"
            autoComplete="off"
            aria-invalid={Boolean(errors.inviteCode)}
            aria-describedby={
              errors.inviteCode ? 'invite-code-error' : undefined
            }
            disabled={busy}
            {...register('inviteCode')}
          />
          <FieldError
            id="invite-code-error"
            message={errors.inviteCode?.message}
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

        {config.termsUrl ? (
          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                disabled={busy}
                aria-invalid={Boolean(errors.termsAccepted)}
                aria-describedby={
                  errors.termsAccepted ? 'terms-error' : undefined
                }
                {...register('termsAccepted')}
              />
              <span>
                我已阅读并同意
                <a
                  href={config.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 rounded-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  服务条款
                </a>
              </span>
            </label>
            <FieldError
              id="terms-error"
              message={errors.termsAccepted?.message}
            />
          </div>
        ) : null}

        {emailCodeError ? (
          <MutationFeedback
            error={emailCodeError}
            message={getLifecycleErrorMessage(emailCodeError, 'email-code')}
          />
        ) : null}
        {registrationError ? (
          <MutationFeedback
            error={registrationError}
            message={getLifecycleErrorMessage(registrationError, 'register')}
          />
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={busy || challengeBlocked}
        >
          {registerMutation.isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {registerMutation.isPending ? '正在注册…' : '注册账号'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        已有账号？{' '}
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
