import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import { useAccountConfig } from '@/features/account/account-queries'
import { useAuth } from '@/features/auth/auth-context'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { formatMinorMoney } from '@/features/catalog/money-format'
import { formatBytes } from '@/features/subscription/subscription-format'
import { useSubscriptionOverview } from '@/features/subscription/subscription-queries'
import { useWallet } from '@/features/wallet/wallet-queries'
import { useRuntimeSettings } from '@/features/runtime-settings/runtime-settings-context'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import {
  CRISP_SCRIPT_ID,
  CRISP_SCRIPT_URL,
  describeClient,
  pushCrisp,
  resetCrisp,
  type CrispCommand,
  type CrispDataPair,
} from './crisp-runtime'

interface SessionIdentity {
  accessToken: string
  generation: number
}

function currentSession(
  identity: SessionIdentity,
  websiteId: string,
  activeWebsite: RefObject<string | null>,
) {
  const state = useAuthSessionStore.getState()
  const script = document.getElementById(CRISP_SCRIPT_ID)
  return (
    state.validated &&
    state.accessToken === identity.accessToken &&
    state.generation === identity.generation &&
    activeWebsite.current === websiteId &&
    script?.dataset.websiteId === websiteId &&
    window.CRISP_WEBSITE_ID === websiteId
  )
}

function CrispAuthenticatedContext({
  identity,
  websiteId,
  activeWebsite,
}: {
  identity: SessionIdentity
  websiteId: string
  activeWebsite: RefObject<string | null>
}) {
  const subscription = useSubscriptionOverview(identity.accessToken)
  const wallet = useWallet(identity.accessToken)
  const config = useAccountConfig(identity.accessToken)
  useExitOnInvalidSessionError(subscription.error)
  useExitOnInvalidSessionError(wallet.error)
  useExitOnInvalidSessionError(config.error)

  useEffect(() => {
    if (
      !subscription.data ||
      !currentSession(identity, websiteId, activeWebsite)
    )
      return
    const data: CrispDataPair[] = [
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
    pushCrisp(['set', 'session:data', [data]])
  }, [activeWebsite, identity, subscription.data, websiteId])

  useEffect(() => {
    if (
      !wallet.data ||
      !config.data ||
      !currentSession(identity, websiteId, activeWebsite)
    )
      return
    const balance = formatMinorMoney(wallet.data.balanceMinor, config.data)
    if (balance !== null) {
      pushCrisp(['set', 'session:data', [[['Balance', balance]]]])
    }
  }, [activeWebsite, config.data, identity, wallet.data, websiteId])

  return null
}

function ConfiguredCrispIntegration({ websiteId }: { websiteId: string }) {
  const { status, currentUser } = useAuth()
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const generation = useAuthSessionStore((state) => state.generation)
  const validated = useAuthSessionStore((state) => state.validated)
  const activeWebsite = useRef<string | null>(null)
  const previousIdentity = useRef<SessionIdentity | null>(null)
  const previousEmail = useRef<string | null>(null)

  useLayoutEffect(() => {
    const existing = document.getElementById(CRISP_SCRIPT_ID)
    if (existing && existing.dataset.websiteId !== websiteId) {
      if (activeWebsite.current) {
        resetCrisp()
        pushCrisp(['do', 'chat:hide'])
      }
      activeWebsite.current = null
      previousIdentity.current = null
      previousEmail.current = null
      return
    }

    if (!existing) {
      window.$crisp ??= [] as CrispCommand[]
      window.CRISP_WEBSITE_ID = websiteId
      const script = document.createElement('script')
      script.id = CRISP_SCRIPT_ID
      script.dataset.websiteId = websiteId
      script.src = CRISP_SCRIPT_URL
      script.async = true
      document.head.append(script)
    }

    if (activeWebsite.current !== websiteId) {
      if (existing) pushCrisp(['do', 'chat:show'])
      activeWebsite.current = websiteId
      pushCrisp([
        'set',
        'session:data',
        [[['Client', describeClient(navigator.userAgent)]]],
      ])
    }

    const nextIdentity =
      validated && accessToken ? { accessToken, generation } : null
    const previous = previousIdentity.current
    if (
      previous &&
      (!nextIdentity ||
        previous.accessToken !== nextIdentity.accessToken ||
        previous.generation !== nextIdentity.generation)
    ) {
      if (!resetCrisp()) {
        activeWebsite.current = null
        pushCrisp(['do', 'chat:hide'])
        return
      }
      previousEmail.current = null
      pushCrisp([
        'set',
        'session:data',
        [[['Client', describeClient(navigator.userAgent)]]],
      ])
    }
    previousIdentity.current = nextIdentity

    if (
      nextIdentity &&
      status === 'authenticated' &&
      currentUser &&
      previousEmail.current !== currentUser.email
    ) {
      if (pushCrisp(['set', 'user:email', [currentUser.email]])) {
        previousEmail.current = currentUser.email
      }
    }
  }, [accessToken, currentUser, generation, status, validated, websiteId])

  const identity = useMemo(
    () =>
      websiteId &&
      status === 'authenticated' &&
      currentUser &&
      validated &&
      accessToken
        ? { accessToken, generation }
        : null,
    [accessToken, currentUser, generation, status, validated, websiteId],
  )

  return identity && websiteId ? (
    <CrispAuthenticatedContext
      key={generation}
      identity={identity}
      websiteId={websiteId}
      activeWebsite={activeWebsite}
    />
  ) : null
}

export function CrispIntegration() {
  const websiteId = useRuntimeSettings().crispWebsiteId
  const previousWebsiteId = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (previousWebsiteId.current && previousWebsiteId.current !== websiteId) {
      resetCrisp()
      pushCrisp(['do', 'chat:hide'])
    }
    previousWebsiteId.current = websiteId
  }, [websiteId])

  return websiteId ? (
    <ConfiguredCrispIntegration key={websiteId} websiteId={websiteId} />
  ) : null
}
