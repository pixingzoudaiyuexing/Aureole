import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useAuth } from '@/features/auth/auth-context'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { ApiError } from '@/lib/api/errors'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { appleIdApi, type AppleIdAccount } from './apple-id-api'
import { appleIdListKey, useAppleIds } from './apple-id-queries'

export function AppleIdPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <AppleIdContent accessToken={accessToken} />
}

function AppleIdContent({ accessToken }: { accessToken: string }) {
  const accounts = useAppleIds(accessToken)
  useExitOnInvalidSessionError(accounts.error)

  if (isInvalidSessionError(accounts.error)) return null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <h2 className="text-2xl font-semibold sm:text-3xl">Apple ID</h2>
      </div>
      <section
        className="border-t border-border py-8"
        aria-label="Apple ID 列表"
      >
        {accounts.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在读取 Apple ID…
          </p>
        ) : accounts.isError ? (
          <ReadError
            message="暂时无法读取 Apple ID。"
            error={accounts.error}
            retry={() => void accounts.refetch()}
          />
        ) : accounts.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            当前没有可用的 Apple ID。
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {accounts.data.items.map((account) => (
              <li key={account.username} className="py-6">
                <AppleIdItem account={account} accessToken={accessToken} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AppleIdItem({
  account,
  accessToken,
}: {
  account: AppleIdAccount
  accessToken: string
}) {
  const queryClient = useQueryClient()
  const [metadata, setMetadata] = useState<{
    source: AppleIdAccount
    value: AppleIdAccount
  } | null>(null)
  const [password, setPassword] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'username' | 'password' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)
  const expiresAt = useRef(0)
  const { sessionInvalidated } = useAuth()
  // A request completed after navigation cannot reintroduce plaintext into the page.
  useEffect(() => {
    return () => {
      requestId.current += 1
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const clearReveal = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    expiresAt.current = 0
    setPassword(null)
    setCopied(null)
  }

  const reveal = async () => {
    const currentRequest = ++requestId.current
    clearReveal()
    setError(null)
    setPending(true)
    try {
      const result = await appleIdApi.reveal(accessToken, account.username)
      if (requestId.current !== currentRequest) return
      setMetadata({
        source: account,
        value: {
          username: result.username,
          status: result.status,
          lastCheck: result.lastCheck,
          remark: result.remark,
        },
      })
      setPassword(result.password)
      expiresAt.current = Date.now() + 10_000
      timer.current = setTimeout(clearReveal, 10_000)
    } catch (cause) {
      if (requestId.current !== currentRequest) return
      clearReveal()
      if (
        cause instanceof ApiError &&
        cause.code === 'APPLE_ID_ACCOUNT_UNAVAILABLE' &&
        cause.status === 409
      ) {
        setError('此 Apple ID 当前不可用，正在更新列表。')
        void queryClient.invalidateQueries({ queryKey: appleIdListKey })
      } else if (isInvalidSessionError(cause)) {
        setError(null)
        sessionInvalidated()
      } else {
        setError('暂时无法显示密码，请稍后重试。')
      }
    } finally {
      if (requestId.current === currentRequest) setPending(false)
    }
  }

  const copy = async (kind: 'username' | 'password') => {
    const value = kind === 'username' ? account.username : password
    if (!value || (kind === 'password' && Date.now() >= expiresAt.current)) {
      if (kind === 'password') clearReveal()
      return
    }
    setCopied(null)
    try {
      await navigator.clipboard.writeText(value)
      if (kind === 'password' && Date.now() >= expiresAt.current) return
      setCopied(kind)
    } catch {
      setError('复制失败，请重试。')
    }
  }

  const current = metadata?.source === account ? metadata.value : account
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Apple ID</p>
          <p className="break-all text-sm font-medium">{account.username}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copy('username')}
        >
          {copied === 'username' ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          复制 Apple ID
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <p>状态：{current.status ? '可用' : '不可用'}</p>
        <p className="break-all">最近检查：{current.lastCheck}</p>
        {current.remark ? (
          <p className="break-words">备注：{current.remark}</p>
        ) : null}
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">密码</p>
        <p className="mt-1 break-all font-mono text-sm">
          {password ?? '••••••••'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void reveal()}
          >
            <Eye className="size-4" aria-hidden="true" />
            {pending ? '正在获取…' : '显示密码'}
          </Button>
          {password ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copy('password')}
            >
              {copied === 'password' ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              复制密码
            </Button>
          ) : null}
        </div>
        {copied ? (
          <p role="status" className="mt-2 text-sm text-primary">
            已复制
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
