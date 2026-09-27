import { Check, Copy, ExternalLink, QrCode, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/errors'
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

export function SubscriptionCredential({
  accessUrl,
  ccAvailable,
  ccAccessUrl,
  ccPending,
  ccError,
  onClashModeChange,
}: {
  accessUrl: string
  ccAvailable: boolean
  ccAccessUrl: string | null
  ccPending: boolean
  ccError: unknown
  onClashModeChange: (enabled: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [qrVisible, setQrVisible] = useState(false)
  const [clashMode, setClashMode] = useState(false)
  const activeClashMode = clashMode && ccAvailable
  const ccModeReady = !activeClashMode || ccAccessUrl !== null
  const actionUrl = activeClashMode ? ccAccessUrl : accessUrl

  const copy = async () => {
    if (!actionUrl || !ccModeReady || ccPending) return
    setCopied(false)
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(actionUrl)
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="space-y-4">
      {ccAvailable ? (
        <label className="flex items-start gap-3 border-l-2 border-border px-4 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-primary"
            checked={clashMode}
            onChange={(event) => {
              const enabled = event.target.checked
              setClashMode(enabled)
              setCopied(false)
              onClashModeChange(enabled)
            }}
          />
          <span>
            <span className="block font-medium">Clash 分流规则</span>
            <span className="mt-1 block text-muted-foreground">
              开启后仅影响复制订阅和 Clash
              导入；页面显示地址、二维码及其他客户端保持原版。
            </span>
          </span>
        </label>
      ) : null}
      <div className="min-h-11 border-y border-border py-3">
        <p className="break-all font-mono text-sm leading-6">{accessUrl}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={!ccModeReady || ccPending}
          onClick={() => void copy()}
        >
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

      {activeClashMode && ccPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          正在准备 Clash 订阅地址…
        </p>
      ) : null}
      {activeClashMode && ccError && !ccPending ? (
        <p className="text-sm text-destructive" role="alert">
          {ccError instanceof ApiError &&
          ccError.code === 'SUBSCRIPTION_ACCESS_UNAVAILABLE'
            ? 'Clash 分流规则暂时不可用，请关闭开关后继续使用默认订阅。'
            : '暂时无法准备 Clash 订阅地址，请关闭开关后重试。'}
        </p>
      ) : null}

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
              disabled={client.id === 'clash' && (!ccModeReady || ccPending)}
              onClick={() =>
                subscriptionImportNavigation.goTo(
                  buildSubscriptionImportUri(
                    client.id,
                    client.id === 'clash' && actionUrl ? actionUrl : accessUrl,
                  ),
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
