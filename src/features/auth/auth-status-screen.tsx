import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { Brand } from '@/components/layout/brand'
import { Button } from '@/components/ui/button'
import { getBootstrapErrorMessage } from './auth-errors'
import { useAuth } from './auth-provider'

export function AuthBootstrapScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="text-center" aria-live="polite" aria-busy="true">
        <Brand className="justify-center" />
        <LoaderCircle
          className="mx-auto mt-8 size-5 animate-spin text-primary"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-base font-semibold">正在验证登录状态</h1>
        <p className="mt-1 text-sm text-muted-foreground">请稍候。</p>
      </section>
    </main>
  )
}

export function AuthRecoveryScreen() {
  const navigate = useNavigate()
  const { bootstrapError, logout, retryBootstrap } = useAuth()

  const handleLogout = async () => {
    logout()
    await navigate({ to: '/login', replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-md" aria-labelledby="auth-error-title">
        <Brand />
        <p className="mt-10 text-xs font-semibold uppercase text-primary">
          登录状态未确认
        </p>
        <h1 id="auth-error-title" className="mt-2 text-2xl font-semibold">
          暂时无法连接服务
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {getBootstrapErrorMessage(bootstrapError)}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={retryBootstrap}>
            <RefreshCw className="size-4" aria-hidden="true" />
            重试
          </Button>
          <Button type="button" variant="outline" onClick={handleLogout}>
            退出登录
          </Button>
        </div>
      </section>
    </main>
  )
}
