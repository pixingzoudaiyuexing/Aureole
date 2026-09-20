import { Check, Copy, ExternalLink, QrCode, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  buildSubscriptionImportUri,
  subscriptionImportNavigation,
  type SubscriptionImportClient,
} from './subscription-imports'

const importClients: Array<{
  id: SubscriptionImportClient
  label: string
}> = [
  { id: 'clash', label: 'Clash' },
  { id: 'shadowrocket', label: 'Shadowrocket' },
  { id: 'quantumult-x', label: 'Quantumult X' },
  { id: 'sing-box', label: 'SingBox' },
]

export function SubscriptionCredential({ accessUrl }: { accessUrl: string }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [qrVisible, setQrVisible] = useState(false)

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
        <p className="break-all font-mono text-sm leading-6">{accessUrl}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void copy()}>
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? '已复制' : '复制'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setQrVisible((value) => !value)}
        >
          {qrVisible ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <QrCode className="size-4" aria-hidden="true" />
          )}
          {qrVisible ? '关闭二维码' : '显示二维码'}
        </Button>
      </div>

      <div className="min-h-5 text-sm" aria-live="polite">
        {copied ? <p className="text-primary">已复制</p> : null}
        {copyFailed ? (
          <p className="text-destructive" role="alert">
            无法复制订阅地址，请重试或手动复制。
          </p>
        ) : null}
      </div>

      {qrVisible ? (
        <div className="border-y border-border py-5">
          <div className="mx-auto w-fit max-w-full bg-white p-3">
            <div role="img" aria-label="订阅二维码">
              <QRCodeSVG
                value={accessUrl}
                size={208}
                level="M"
                marginSize={1}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-semibold">导入客户端</p>
        <div className="flex flex-wrap gap-2">
          {importClients.map((client) => (
            <Button
              key={client.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                subscriptionImportNavigation.goTo(
                  buildSubscriptionImportUri(client.id, accessUrl),
                )
              }
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {client.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
