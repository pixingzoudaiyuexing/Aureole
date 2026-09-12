import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LoaderCircle, LockKeyhole } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api/errors'
import { loginSchema, type LoginInput } from './auth-api'
import { useAuth } from './auth-context'
import { getLoginErrorMessage } from './auth-errors'

export function LoginPage({
  passwordResetSucceeded = false,
}: {
  passwordResetSucceeded?: boolean
}) {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const {
    register,
    handleSubmit,
    clearErrors,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    defaultValues: { email: '', password: '' },
  })
  const loginMutation = useMutation({
    mutationFn: signIn,
    retry: false,
  })

  const submit = handleSubmit(async (values) => {
    loginMutation.reset()
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (field === 'email' || field === 'password') {
          setError(field, { type: 'validate', message: issue.message })
        }
      }
      return
    }

    try {
      await loginMutation.mutateAsync(parsed.data)
      await navigate({ to: '/dashboard', replace: true })
    } catch {
      // The mutation error is translated below without exposing raw details.
    }
  })

  const emailField = register('email')
  const passwordField = register('password')
  const busy = isSubmitting || loginMutation.isPending
  const requestId =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.requestId
      : undefined

  return (
    <section className="w-full max-w-[26rem]" aria-labelledby="login-title">
      <span className="flex size-11 items-center justify-center rounded-md bg-secondary text-primary">
        <LockKeyhole className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-8 text-xs font-semibold uppercase text-primary">
        欢迎回来
      </p>
      <h1 id="login-title" className="mt-2 text-3xl font-semibold">
        登录 Aureole
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        登录后管理你的订阅、订单和支持请求。
      </p>

      {passwordResetSucceeded ? (
        <div
          className="mt-6 border-l-2 border-primary bg-primary/5 px-4 py-3"
          role="status"
        >
          <p className="text-sm text-foreground">
            密码已重置，请使用新密码登录。
          </p>
        </div>
      ) : null}

      <form
        className="mt-8 space-y-5"
        onSubmit={submit}
        onChange={() => {
          loginMutation.reset()
          clearErrors()
        }}
        noValidate
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            邮箱
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            disabled={busy}
            {...emailField}
          />
          {errors.email ? (
            <p id="email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium" htmlFor="password">
              密码
            </label>
            <Link
              to="/forgot-password"
              className="rounded-sm text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              忘记密码
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            disabled={busy}
            {...passwordField}
          />
          {errors.password ? (
            <p id="password-error" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        {loginMutation.isError ? (
          <div
            className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
            role="alert"
          >
            <p className="text-sm text-foreground">
              {getLoginErrorMessage(loginMutation.error)}
            </p>
            {requestId ? (
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                请求编号：{requestId}
              </p>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {busy ? '正在登录…' : '登录'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        还没有账号？{' '}
        <Link
          to="/register"
          className="rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          注册账号
        </Link>
      </p>
    </section>
  )
}
