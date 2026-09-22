export const AUTH_SHARED_STATE_KEY = 'aureole.auth.shared-session'
export const AUTH_BROADCAST_CHANNEL = 'aureole.auth.session'

export type SharedSessionState = {
  version: string
  status: 'active' | 'changing' | 'logged-out'
}

type SessionMessage =
  | { type: 'REQUEST_SESSION'; requestId: string; version: string }
  | {
      type: 'PROVIDE_SESSION'
      requestId: string
      version: string
      accessToken: string
    }
  | { type: 'SESSION_CHANGED'; version: string }
  | { type: 'LOGOUT'; version: string }

export interface CrossTabSessionEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  createChannel: (() => BroadcastChannel) | null
  addWindowListener: typeof window.addEventListener
  removeWindowListener: typeof window.removeEventListener
  document: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >
  randomId: () => string
  setTimeout: typeof window.setTimeout
  clearTimeout: typeof window.clearTimeout
}

export interface LocalShareableSession {
  accessToken: string
  version: string
  validated: boolean
}

function parseSharedState(value: string | null): SharedSessionState | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<SharedSessionState>
    if (
      typeof parsed.version !== 'string' ||
      !['active', 'changing', 'logged-out'].includes(parsed.status ?? '')
    ) {
      return null
    }
    return parsed as SharedSessionState
  } catch {
    return null
  }
}

function isSessionMessage(value: unknown): value is SessionMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<SessionMessage>
  if (typeof message.type !== 'string' || typeof message.version !== 'string') {
    return false
  }
  if (message.type === 'SESSION_CHANGED' || message.type === 'LOGOUT')
    return true
  if (typeof (message as { requestId?: unknown }).requestId !== 'string') {
    return false
  }
  if (message.type === 'REQUEST_SESSION') return true
  return (
    message.type === 'PROVIDE_SESSION' &&
    typeof message.accessToken === 'string'
  )
}

export function browserCrossTabSessionEnvironment(): CrossTabSessionEnvironment {
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    // Memory/sessionStorage-only authentication remains available.
  }
  return {
    storage,
    createChannel:
      typeof BroadcastChannel === 'undefined'
        ? null
        : () => new BroadcastChannel(AUTH_BROADCAST_CHANNEL),
    addWindowListener: window.addEventListener.bind(window),
    removeWindowListener: window.removeEventListener.bind(window),
    document,
    randomId: () =>
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  }
}

export class CrossTabSessionCoordinator {
  private readonly environment: CrossTabSessionEnvironment
  private readonly getLocalSession: () => LocalShareableSession | null
  private readonly onSharedStateChanged: (
    state: SharedSessionState | null,
  ) => void
  private channel: BroadcastChannel | null = null
  private pending: {
    requestId: string
    version: string
    resolve: (value: LocalShareableSession | null) => void
    timer: number
  } | null = null

  constructor(
    environment: CrossTabSessionEnvironment,
    getLocalSession: () => LocalShareableSession | null,
    onSharedStateChanged: (state: SharedSessionState | null) => void,
  ) {
    this.environment = environment
    this.getLocalSession = getLocalSession
    this.onSharedStateChanged = onSharedStateChanged
  }

  start() {
    try {
      this.channel = this.environment.createChannel?.() ?? null
      if (this.channel) this.channel.onmessage = this.onMessage
    } catch {
      this.channel = null
    }
    this.environment.addWindowListener('storage', this.onStorage)
    this.environment.addWindowListener('focus', this.onFocus)
    this.environment.document.addEventListener(
      'visibilitychange',
      this.onVisibility,
    )
  }

  dispose() {
    this.environment.removeWindowListener('storage', this.onStorage)
    this.environment.removeWindowListener('focus', this.onFocus)
    this.environment.document.removeEventListener(
      'visibilitychange',
      this.onVisibility,
    )
    this.channel?.close()
    this.finishPending(null)
  }

  readSharedState() {
    try {
      return parseSharedState(
        this.environment.storage?.getItem(AUTH_SHARED_STATE_KEY) ?? null,
      )
    } catch {
      return null
    }
  }

  createVersion() {
    return this.environment.randomId()
  }

  publishState(state: SharedSessionState) {
    try {
      this.environment.storage?.setItem(
        AUTH_SHARED_STATE_KEY,
        JSON.stringify(state),
      )
    } catch {
      // Broadcast still provides a best-effort same-runtime boundary.
    }
    this.post({
      type: state.status === 'logged-out' ? 'LOGOUT' : 'SESSION_CHANGED',
      version: state.version,
    })
  }

  async requestCurrentSession(timeoutMs = 700) {
    const shared = this.readSharedState()
    if (!shared || shared.status !== 'active' || !this.channel) return null
    this.finishPending(null)
    return new Promise<LocalShareableSession | null>((resolve) => {
      const requestId = this.environment.randomId()
      const timer = this.environment.setTimeout(
        () => this.finishPending(null),
        timeoutMs,
      )
      this.pending = { requestId, version: shared.version, resolve, timer }
      this.post({ type: 'REQUEST_SESSION', requestId, version: shared.version })
    })
  }

  reconcile() {
    this.onSharedStateChanged(this.readSharedState())
  }

  private post(message: SessionMessage) {
    try {
      this.channel?.postMessage(message)
    } catch {
      // The caller will fall back to the existing per-tab session behavior.
    }
  }

  private finishPending(value: LocalShareableSession | null) {
    if (!this.pending) return
    this.environment.clearTimeout(this.pending.timer)
    const { resolve } = this.pending
    this.pending = null
    resolve(value)
  }

  private onMessage = (event: MessageEvent<unknown>) => {
    if (!isSessionMessage(event.data)) return
    const message = event.data
    if (message.type === 'REQUEST_SESSION') {
      const local = this.getLocalSession()
      const shared = this.readSharedState()
      if (
        local?.validated &&
        local.version === message.version &&
        shared?.status === 'active' &&
        shared.version === local.version
      ) {
        this.post({
          type: 'PROVIDE_SESSION',
          requestId: message.requestId,
          version: local.version,
          accessToken: local.accessToken,
        })
      }
      return
    }
    if (message.type === 'PROVIDE_SESSION') {
      const shared = this.readSharedState()
      if (
        this.pending?.requestId === message.requestId &&
        this.pending.version === message.version &&
        shared?.status === 'active' &&
        shared.version === message.version
      ) {
        this.finishPending({
          accessToken: message.accessToken,
          version: message.version,
          validated: false,
        })
      }
      return
    }
    this.reconcile()
  }

  private onStorage = (event: StorageEvent) => {
    if (event.key === AUTH_SHARED_STATE_KEY) this.reconcile()
  }

  private onFocus = () => this.reconcile()

  private onVisibility = () => {
    if (this.environment.document.visibilityState === 'visible')
      this.reconcile()
  }
}
