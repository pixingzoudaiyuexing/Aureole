import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { RefreshCw } from 'lucide-react'
import { useTheme } from '@/app/providers/theme-provider'
import { Button } from '@/components/ui/button'
import type { AntiBotCapability } from '../public-account-api'
import { loadRecaptchaV2Checkbox } from './recaptcha-script-loader'
import type { RecaptchaV2Api } from './recaptcha-types'

export interface ChallengeFieldHandle {
  reset: () => void
}

interface ChallengeFieldProps {
  capability: AntiBotCapability
  onTokenChange: (token: string | null) => void
  loadApi?: () => Promise<RecaptchaV2Api>
}

export const ChallengeField = forwardRef<
  ChallengeFieldHandle,
  ChallengeFieldProps
>(function ChallengeField(
  { capability, onTokenChange, loadApi = loadRecaptchaV2Checkbox },
  ref,
) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<RecaptchaV2Api | null>(null)
  const widgetIdRef = useRef<number | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)
  onTokenChangeRef.current = onTokenChange
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const reset = () => {
    onTokenChangeRef.current(null)
    if (apiRef.current && widgetIdRef.current !== null) {
      apiRef.current.reset(widgetIdRef.current)
    }
  }

  useImperativeHandle(ref, () => ({ reset }))

  useEffect(() => {
    if (capability.state !== 'supported') {
      onTokenChangeRef.current(null)
      return
    }

    let cancelled = false
    setStatus('loading')
    onTokenChangeRef.current(null)

    void loadApi()
      .then((api) => {
        if (cancelled || !containerRef.current) return
        apiRef.current = api
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: capability.siteKey,
          theme: resolvedTheme,
          callback: (token) => {
            if (!cancelled) onTokenChangeRef.current(token)
          },
          'expired-callback': () => {
            if (!cancelled) onTokenChangeRef.current(null)
          },
          'error-callback': () => {
            if (!cancelled) {
              onTokenChangeRef.current(null)
              setStatus('error')
            }
          },
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          onTokenChangeRef.current(null)
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
      if (apiRef.current && widgetIdRef.current !== null) {
        apiRef.current.reset(widgetIdRef.current)
      }
      apiRef.current = null
      widgetIdRef.current = null
    }
  }, [capability, loadApi, loadAttempt, resolvedTheme])

  if (capability.state === 'disabled') return null

  if (capability.state === 'unsupported') {
    return (
      <div
        className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
        role="alert"
      >
        <p className="text-sm font-medium">当前验证方式暂不受支持</p>
        <p className="mt-1 text-sm text-muted-foreground">
          暂时无法继续此操作，请稍后再试。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">人机验证</p>
      <div
        key={`${resolvedTheme}-${loadAttempt}`}
        className="min-h-[78px] max-w-full overflow-x-auto"
        ref={containerRef}
      />
      {status === 'loading' ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          正在加载人机验证…
        </p>
      ) : null}
      {status === 'error' ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive">
            人机验证加载失败，请检查网络后重试。
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            重新加载验证
          </Button>
        </div>
      ) : null}
    </div>
  )
})
