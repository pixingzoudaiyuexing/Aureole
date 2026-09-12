import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function SubscriptionCredential({ accessUrl }: { accessUrl: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const copy = async () => {
    setCopied(false)
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(accessUrl)
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="space-y-4">
      <div className="min-h-11 border-y border-border py-3">
        {revealed ? (
          <p className="break-all font-mono text-sm leading-6">{accessUrl}</p>
        ) : (
          <p
            className="font-mono text-sm tracking-widest text-muted-foreground"
            aria-label="订阅地址已隐藏"
          >
            ••••••••••••••••••••
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setRevealed((value) => !value)
            setCopied(false)
            setCopyFailed(false)
          }}
        >
          {revealed ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
          {revealed ? '隐藏' : '显示'}
        </Button>
        <Button type="button" onClick={() => void copy()}>
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>

      <div className="min-h-5 text-sm" aria-live="polite">
        {copied ? <p className="text-primary">已复制</p> : null}
        {copyFailed ? (
          <p className="text-destructive" role="alert">
            无法复制订阅地址，请重试或先显示后手动复制。
          </p>
        ) : null}
      </div>
    </div>
  )
}
