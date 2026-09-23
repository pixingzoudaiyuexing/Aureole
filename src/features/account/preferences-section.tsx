import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useAuth } from '@/features/auth/auth-context'
import { MutationFeedback } from '@/features/auth/form-feedback'
import { useSynchronousActionLock } from '@/features/auth/use-synchronous-action-lock'
import { isErrorFromCurrentAuthSession } from '@/lib/auth/session-store'
import {
  accountApi,
  type AccountPreferences,
  type AccountPreferencesUpdate,
} from './account-api'
import {
  getPreferencesErrorMessage,
  isAmbiguousAccountMutationError,
} from './account-errors'
import { useAccountPreferences } from './account-queries'

const preferenceFields = [
  { key: 'autoRenewal', label: '自动续费' },
  { key: 'remindExpire', label: '到期提醒' },
  { key: 'remindTraffic', label: '流量提醒' },
] as const

type PreferenceFeedback =
  | { kind: 'success' | 'uncertain'; message: string }
  | { kind: 'error'; message: string; error: unknown }

function getChanges(
  current: AccountPreferences,
  draft: AccountPreferences,
): AccountPreferencesUpdate {
  const changes: AccountPreferencesUpdate = {}
  for (const { key } of preferenceFields) {
    if (current[key] !== draft[key]) changes[key] = draft[key]
  }
  return changes
}

export function PreferencesSection({ accessToken }: { accessToken: string }) {
  const { sessionInvalidated } = useAuth()
  const actionLock = useSynchronousActionLock()
  const preferences = useAccountPreferences(accessToken)
  const [edits, setEdits] = useState<AccountPreferencesUpdate>({})
  const [feedback, setFeedback] = useState<PreferenceFeedback | null>(null)
  const mutation = useMutation({
    mutationFn: (changes: AccountPreferencesUpdate) =>
      accountApi.updatePreferences(accessToken, changes),
    retry: false,
  })

  useEffect(() => {
    if (
      preferences.isError &&
      isInvalidSessionError(preferences.error) &&
      isErrorFromCurrentAuthSession(preferences.error)
    ) {
      sessionInvalidated()
    }
  }, [sessionInvalidated, preferences.error, preferences.isError])

  const reconcile = async () => {
    const result = await preferences.refetch()
    if (result.isSuccess) {
      setEdits({})
      return 'confirmed' as const
    }
    if (
      isInvalidSessionError(result.error) &&
      isErrorFromCurrentAuthSession(result.error)
    ) {
      sessionInvalidated()
      return 'invalid-session' as const
    }
    return 'failed' as const
  }

  const save = async () => {
    if (!preferences.data) return
    const draft = { ...preferences.data, ...edits }
    const changes = getChanges(preferences.data, draft)
    if (Object.keys(changes).length === 0) return
    if (!actionLock.tryAcquire()) return

    mutation.reset()
    setFeedback(null)
    try {
      await mutation.mutateAsync(changes)
      const reconciliation = await reconcile()
      if (reconciliation === 'invalid-session') return
      setFeedback(
        reconciliation === 'confirmed'
          ? { kind: 'success', message: '偏好设置已保存。' }
          : {
              kind: 'uncertain',
              message:
                '保存请求已完成，但暂时无法读取服务器当前设置，请稍后重试确认。',
            },
      )
    } catch (error) {
      if (
        isInvalidSessionError(error) &&
        isErrorFromCurrentAuthSession(error)
      ) {
        sessionInvalidated()
        return
      }
      if (isAmbiguousAccountMutationError(error)) {
        const reconciliation = await reconcile()
        if (reconciliation === 'invalid-session') return
        setFeedback({
          kind: 'uncertain',
          message:
            reconciliation === 'confirmed'
              ? '保存结果无法确认，已重新读取服务器当前设置，请核对后再继续。'
              : '保存结果和服务器当前设置均无法确认，请稍后刷新页面核对，暂时不要重复保存。',
        })
        return
      }
      setFeedback({
        kind: 'error',
        message: getPreferencesErrorMessage(error),
        error,
      })
    } finally {
      actionLock.release()
    }
  }

  if (preferences.isError && !preferences.data) {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-foreground">暂时无法读取偏好设置。</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void preferences.refetch()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          重试
        </Button>
      </div>
    )
  }

  if (preferences.isPending || !preferences.data) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在读取偏好设置…
      </p>
    )
  }

  const draft = { ...preferences.data, ...edits }
  const changes = getChanges(preferences.data, draft)
  const dirty = Object.keys(changes).length > 0
  const busy = mutation.isPending || preferences.isFetching

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <fieldset className="divide-y divide-border border-y border-border">
        <legend className="sr-only">账户偏好</legend>
        {preferenceFields.map(({ key, label }) => (
          <label
            className="flex min-h-14 cursor-pointer items-center justify-between gap-5 py-3 text-sm"
            key={key}
          >
            <span className="font-medium">{label}</span>
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-primary"
              checked={draft[key]}
              disabled={busy}
              onChange={(event) => {
                const next = { ...draft, [key]: event.target.checked }
                setEdits(getChanges(preferences.data, next))
                setFeedback(null)
                mutation.reset()
              }}
            />
          </label>
        ))}
      </fieldset>

      {feedback?.kind === 'error' ? (
        <MutationFeedback error={feedback.error} message={feedback.message} />
      ) : feedback ? (
        <div
          className={
            feedback.kind === 'success'
              ? 'border-l-2 border-primary bg-primary/5 px-4 py-3'
              : 'border-l-2 border-foreground/40 bg-muted px-4 py-3'
          }
          role={feedback.kind === 'success' ? 'status' : 'alert'}
        >
          <p className="text-sm text-foreground">{feedback.message}</p>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || busy}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {mutation.isPending ? '正在保存…' : '保存偏好'}
        </Button>
        {!dirty && !feedback ? (
          <p className="text-xs text-muted-foreground">当前没有未保存的更改</p>
        ) : null}
      </div>
    </form>
  )
}
