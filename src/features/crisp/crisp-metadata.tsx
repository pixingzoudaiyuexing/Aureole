import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useAccountConfig } from '@/features/account/account-queries'
import { useAuth } from '@/features/auth/auth-context'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { useRuntimeSettings } from '@/features/runtime-settings/runtime-settings-context'
import { formatBytes } from '@/features/subscription/subscription-format'
import { useSubscriptionOverview } from '@/features/subscription/subscription-queries'
import { useWallet } from '@/features/wallet/wallet-queries'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import type { CrispCommand } from './crisp-loader'
import { getBootWebsiteId } from './crisp-script'

function issue(command: CrispCommand) {
  try {
    if (!window.$crisp) return false
    window.$crisp.push(command)
    return true
  } catch {
    return false
  }
}

function describeClient(userAgent: string) {
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Firefox\//i.test(userAgent)
      ? 'Firefox'
      : /Chrome\//i.test(userAgent)
        ? 'Chrome'
        : /Safari\//i.test(userAgent)
          ? 'Safari'
          : 'Browser'
  const os = /iPhone|iPad|iPod/i.test(userAgent)
    ? 'iOS'
    : /Android/i.test(userAgent)
      ? 'Android'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Other OS'
  const device = /Mobile|iPhone|iPod|Android/i.test(userAgent)
    ? 'Mobile'
    : 'Desktop'
  return `${browser} / ${os} / ${device}`
}

function AuthenticatedMetadata({
  accessToken,
  publish,
}: {
  accessToken: string
  publish: (command: CrispCommand) => void
}) {
  const subscription = useSubscriptionOverview(accessToken)
  const wallet = useWallet(accessToken)
  const config = useAccountConfig(accessToken)

  useEffect(() => {
    publish([
      'set',
      'session:data',
      [[['Client', describeClient(navigator.userAgent)]]],
    ])
  }, [publish])

  useEffect(() => {
    if (!subscription.data) return
    const data: [string, string][] = [
      ['Plan', subscription.data.product?.name ?? '-'],
      ['ExpireTime', subscription.data.expiresAt?.slice(0, 10) ?? '-'],
      ['AllTraffic', formatBytes(subscription.data.traffic.allowanceBytes)],
    ]
    const used =
      subscription.data.traffic.uploadedBytes +
      subscription.data.traffic.downloadedBytes
    if (Number.isSafeInteger(used)) {
      data.push(['UsedTraffic', formatBytes(used)])
    }
    publish(['set', 'session:data', [data]])
  }, [subscription.data, publish])

  useEffect(() => {
    if (!wallet.data || !config.data) return
    const balance = formatMinorMoney(wallet.data.balanceMinor, config.data)
    if (balance !== null) {
      publish(['set', 'session:data', [[['Balance', balance]]]])
    }
  }, [wallet.data, config.data, publish])

  return null
}

export function CrispMetadata() {
  const websiteId = useRuntimeSettings().crispWebsiteId
  const { status, currentUser } = useAuth()
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const hasSession = Boolean(accessToken)
  const email =
    status === 'authenticated' && hasSession
      ? (currentUser?.email ?? null)
      : null
  const previousPublishedEmail = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!websiteId || websiteId !== getBootWebsiteId()) return
    // A temporary auth verification is not an account exit.
    if (!email && hasSession) return
    if (
      previousPublishedEmail.current &&
      previousPublishedEmail.current !== email
    ) {
      if (!issue(['do', 'session:reset'])) return
      previousPublishedEmail.current = null
    }
    if (email && issue(['set', 'user:email', [email]])) {
      previousPublishedEmail.current = email
    }
  }, [websiteId, email, hasSession])

  const publish = useCallback(
    (command: CrispCommand) => {
      if (
        websiteId &&
        websiteId === getBootWebsiteId() &&
        email &&
        previousPublishedEmail.current === email
      ) {
        issue(command)
      }
    },
    [websiteId, email],
  )

  return websiteId && email && accessToken ? (
    <AuthenticatedMetadata
      key={email}
      accessToken={accessToken}
      publish={publish}
    />
  ) : null
}
