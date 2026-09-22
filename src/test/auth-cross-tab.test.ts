import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_SHARED_STATE_KEY,
  CrossTabSessionCoordinator,
  type CrossTabSessionEnvironment,
  type LocalShareableSession,
} from '@/lib/auth/cross-tab-session'

class MemoryStorage {
  values = new Map<string, string>()
  afterRead: (() => void) | null = null
  getItem(key: string) {
    const value = this.values.get(key) ?? null
    const afterRead = this.afterRead
    this.afterRead = null
    afterRead?.()
    return value
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

class LockHub {
  active = 0
  maxActive = 0
  private tail = Promise.resolve()

  request = <T>(signal: AbortSignal, callback: () => T | PromiseLike<T>) => {
    const result = this.tail.then(async () => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      this.active += 1
      this.maxActive = Math.max(this.maxActive, this.active)
      try {
        return await callback()
      } finally {
        this.active -= 1
      }
    })
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

type EnvironmentControls = {
  windowListeners: Map<string, EventListener>
  documentListeners: Map<string, EventListener>
  visibilityState: DocumentVisibilityState
}

function environmentControls(): EnvironmentControls {
  return {
    windowListeners: new Map(),
    documentListeners: new Map(),
    visibilityState: 'visible',
  }
}

class ChannelHub {
  channels = new Set<FakeChannel>()
  create() {
    const channel = new FakeChannel(this)
    this.channels.add(channel)
    return channel
  }
  send(sender: FakeChannel, data: unknown) {
    for (const channel of this.channels) {
      if (channel !== sender && !channel.closed) {
        queueMicrotask(() => channel.onmessage?.({ data } as MessageEvent))
      }
    }
  }
}

class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false
  private hub: Pick<ChannelHub, 'send'>
  constructor(hub: Pick<ChannelHub, 'send'>) {
    this.hub = hub
  }
  postMessage(data: unknown) {
    this.hub.send(this, data)
  }
  close() {
    this.closed = true
  }
}

function environment(
  storage: MemoryStorage | null,
  hub: ChannelHub | null,
  ids: string[],
  lockHub: LockHub | null = new LockHub(),
  controls = environmentControls(),
): CrossTabSessionEnvironment {
  return {
    storage,
    createChannel: hub
      ? () => hub.create() as unknown as BroadcastChannel
      : null,
    requestLock: lockHub?.request ?? null,
    addWindowListener: ((type: string, listener: EventListener) => {
      controls.windowListeners.set(type, listener)
    }) as typeof window.addEventListener,
    removeWindowListener: ((type: string) => {
      controls.windowListeners.delete(type)
    }) as typeof window.removeEventListener,
    document: {
      get visibilityState() {
        return controls.visibilityState
      },
      addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
      ) => controls.documentListeners.set(type, listener as EventListener),
      removeEventListener: (type: string) =>
        controls.documentListeners.delete(type),
    },
    randomId: () => ids.shift() ?? 'fallback-id',
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  }
}

afterEach(() => vi.useRealTimers())

describe('CrossTabSessionCoordinator', () => {
  it('hands off only the requested current validated session', async () => {
    const storage = new MemoryStorage()
    const hub = new ChannelHub()
    const version = 'session-v1'
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version, status: 'active' }),
    )
    const provider: LocalShareableSession = {
      accessToken: 'opaque-token',
      version,
      validated: true,
    }
    const first = new CrossTabSessionCoordinator(
      environment(storage, hub, ['provider']),
      () => provider,
      vi.fn(),
    )
    const second = new CrossTabSessionCoordinator(
      environment(storage, hub, ['request-1']),
      () => null,
      vi.fn(),
    )
    first.start()
    second.start()

    await expect(second.requestCurrentSession()).resolves.toEqual({
      accessToken: 'opaque-token',
      version,
      validated: false,
    })
    first.dispose()
    second.dispose()
  })

  it('rejects unrequested, mismatched, stale-version, and timed-out responses', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const hub = new ChannelHub()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'current', status: 'active' }),
    )
    const requester = new CrossTabSessionCoordinator(
      environment(storage, hub, ['request-current']),
      () => null,
      vi.fn(),
    )
    const attacker = hub.create()
    requester.start()
    attacker.postMessage({
      type: 'PROVIDE_SESSION',
      requestId: 'unrequested',
      version: 'current',
      accessToken: 'wrong',
    })
    const pending = requester.requestCurrentSession(500)
    attacker.postMessage({
      type: 'PROVIDE_SESSION',
      requestId: 'request-current',
      version: 'stale',
      accessToken: 'wrong',
    })
    await vi.advanceTimersByTimeAsync(500)
    await expect(pending).resolves.toBeNull()
    expect(storage.getItem(AUTH_SHARED_STATE_KEY)).toContain('current')
    attacker.postMessage({
      type: 'PROVIDE_SESSION',
      requestId: 'request-current',
      version: 'current',
      accessToken: 'late',
    })
    await vi.runAllTimersAsync()
    requester.dispose()
    attacker.close()
  })

  it('reconciles logout and safely degrades without channel or storage', async () => {
    const storage = new MemoryStorage()
    const hub = new ChannelHub()
    const changed = vi.fn()
    const listener = new CrossTabSessionCoordinator(
      environment(storage, hub, ['listener']),
      () => null,
      changed,
    )
    const publisher = new CrossTabSessionCoordinator(
      environment(storage, hub, ['publisher']),
      () => null,
      vi.fn(),
    )
    listener.start()
    publisher.start()
    await expect(
      publisher.publishState({ version: 'logout-v2', status: 'logged-out' }),
    ).resolves.toBe('published')
    await vi.waitFor(() =>
      expect(changed).toHaveBeenCalledWith({
        version: 'logout-v2',
        status: 'logged-out',
      }),
    )

    const fallback = new CrossTabSessionCoordinator(
      environment(null, null, ['fallback']),
      () => null,
      vi.fn(),
    )
    fallback.start()
    await expect(fallback.requestCurrentSession()).resolves.toBeNull()
    await expect(
      fallback.publishState({ version: 'v3', status: 'active' }),
    ).resolves.toBe('local-only')
    fallback.dispose()
    listener.dispose()
    publisher.dispose()
  })

  it('will not restore an old provider after a newer shared version is active', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const hub = new ChannelHub()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'session-b', status: 'active' }),
    )
    const staleProvider = new CrossTabSessionCoordinator(
      environment(storage, hub, ['stale-provider']),
      () => ({
        accessToken: 'session-a-token',
        version: 'session-a',
        validated: true,
      }),
      vi.fn(),
    )
    const requester = new CrossTabSessionCoordinator(
      environment(storage, hub, ['request-b']),
      () => null,
      vi.fn(),
    )
    staleProvider.start()
    requester.start()

    const pending = requester.requestCurrentSession(250)
    await vi.advanceTimersByTimeAsync(250)
    await expect(pending).resolves.toBeNull()
    staleProvider.dispose()
    requester.dispose()
  })

  it('serializes a newer logout attempted after an old active transition reads', async () => {
    const storage = new MemoryStorage()
    const lockHub = new LockHub()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'session-v1', status: 'changing' }),
    )
    const oldActor = new CrossTabSessionCoordinator(
      environment(storage, null, ['old'], lockHub),
      () => null,
      vi.fn(),
    )
    const newerActor = new CrossTabSessionCoordinator(
      environment(storage, null, ['newer'], lockHub),
      () => null,
      vi.fn(),
    )
    let newerPublication!: Promise<
      Awaited<ReturnType<typeof newerActor.publishState>>
    >
    storage.afterRead = () => {
      expect(lockHub.active).toBe(1)
      newerPublication = newerActor.publishState({
        version: 'session-v2-logout',
        status: 'logged-out',
      })
    }

    await expect(oldActor.publishActiveIfCurrent('session-v1')).resolves.toBe(
      'published',
    )
    await expect(newerPublication).resolves.toBe('published')
    expect(lockHub.maxActive).toBe(1)
    expect(JSON.parse(storage.getItem(AUTH_SHARED_STATE_KEY)!)).toEqual({
      version: 'session-v2-logout',
      status: 'logged-out',
    })
  })

  it('serializes a newer active session attempted after an old logout reads', async () => {
    const storage = new MemoryStorage()
    const lockHub = new LockHub()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'session-v1', status: 'active' }),
    )
    const oldActor = new CrossTabSessionCoordinator(
      environment(storage, null, ['old'], lockHub),
      () => null,
      vi.fn(),
    )
    const newerActor = new CrossTabSessionCoordinator(
      environment(storage, null, ['newer'], lockHub),
      () => null,
      vi.fn(),
    )
    let newerPublication!: Promise<
      Awaited<ReturnType<typeof newerActor.publishState>>
    >
    storage.afterRead = () => {
      expect(lockHub.active).toBe(1)
      newerPublication = newerActor.publishState({
        version: 'session-v2',
        status: 'active',
      })
    }

    await expect(
      oldActor.publishLogoutIfCurrent('session-v1', 'session-v1-logout'),
    ).resolves.toBe('published')
    await expect(newerPublication).resolves.toBe('published')
    expect(lockHub.maxActive).toBe(1)
    expect(JSON.parse(storage.getItem(AUTH_SHARED_STATE_KEY)!)).toEqual({
      version: 'session-v2',
      status: 'active',
    })
  })

  it('uses the current shared state instead of a delayed logout message', async () => {
    const storage = new MemoryStorage()
    const hub = new ChannelHub()
    const changed = vi.fn()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'session-v2', status: 'active' }),
    )
    const listener = new CrossTabSessionCoordinator(
      environment(storage, hub, ['listener']),
      () => null,
      changed,
    )
    listener.start()
    const sender = hub.create()

    sender.postMessage({ type: 'LOGOUT', version: 'session-v1' })

    await vi.waitFor(() =>
      expect(changed).toHaveBeenCalledWith({
        version: 'session-v2',
        status: 'active',
      }),
    )
    listener.dispose()
    sender.close()
  })

  it.each(['changing', 'active'] as const)(
    'uses the current shared state instead of delayed old %s notification',
    async (status) => {
      const storage = new MemoryStorage()
      const hub = new ChannelHub()
      const changed = vi.fn()
      storage.setItem(
        AUTH_SHARED_STATE_KEY,
        JSON.stringify({ version: 'session-v2', status: 'active' }),
      )
      const listener = new CrossTabSessionCoordinator(
        environment(storage, hub, ['listener']),
        () => null,
        changed,
      )
      listener.start()
      const sender = hub.create()

      sender.postMessage({
        type: 'SESSION_CHANGED',
        version: 'session-v1',
        status,
      })

      await vi.waitFor(() =>
        expect(changed).toHaveBeenCalledWith({
          version: 'session-v2',
          status: 'active',
        }),
      )
      listener.dispose()
      sender.close()
    },
  )

  it('still reconciles a logout for the current shared version', async () => {
    const storage = new MemoryStorage()
    const hub = new ChannelHub()
    const changed = vi.fn()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'logout-v2', status: 'logged-out' }),
    )
    const listener = new CrossTabSessionCoordinator(
      environment(storage, hub, ['listener']),
      () => null,
      changed,
    )
    listener.start()
    const sender = hub.create()

    sender.postMessage({ type: 'LOGOUT', version: 'logout-v2' })

    await vi.waitFor(() =>
      expect(changed).toHaveBeenCalledWith({
        version: 'logout-v2',
        status: 'logged-out',
      }),
    )
    listener.dispose()
    sender.close()
  })

  it('reconciles the current shared state when a background tab resumes', () => {
    const storage = new MemoryStorage()
    const controls = environmentControls()
    const changed = vi.fn()
    controls.visibilityState = 'hidden'
    const listener = new CrossTabSessionCoordinator(
      environment(storage, null, ['listener'], new LockHub(), controls),
      () => null,
      changed,
    )
    listener.start()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'logout-v2', status: 'logged-out' }),
    )

    controls.visibilityState = 'visible'
    controls.documentListeners.get('visibilitychange')?.(new Event('change'))

    expect(changed).toHaveBeenCalledWith({
      version: 'logout-v2',
      status: 'logged-out',
    })
    listener.dispose()
  })

  it('degrades to local-only auth when cross-tab locking is unavailable', async () => {
    const storage = new MemoryStorage()
    const hub = new ChannelHub()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'session-v1', status: 'changing' }),
    )
    const coordinator = new CrossTabSessionCoordinator(
      environment(storage, hub, ['local'], null),
      () => null,
      vi.fn(),
    )
    coordinator.start()

    await expect(
      coordinator.publishActiveIfCurrent('session-v1'),
    ).resolves.toBe('local-only')
    await expect(
      coordinator.publishLogoutIfCurrent('session-v1', 'logout-v2'),
    ).resolves.toBe('local-only')
    expect(hub.channels.size).toBe(0)
    expect(JSON.parse(storage.getItem(AUTH_SHARED_STATE_KEY)!)).toEqual({
      version: 'session-v1',
      status: 'changing',
    })
    coordinator.dispose()
  })

  it('rejects old conditional transitions after a newer version commits', async () => {
    const storage = new MemoryStorage()
    const lockHub = new LockHub()
    const oldActor = new CrossTabSessionCoordinator(
      environment(storage, null, ['old'], lockHub),
      () => null,
      vi.fn(),
    )
    const newerActor = new CrossTabSessionCoordinator(
      environment(storage, null, ['newer'], lockHub),
      () => null,
      vi.fn(),
    )
    await expect(
      newerActor.publishState({ version: 'session-v2', status: 'active' }),
    ).resolves.toBe('published')

    await expect(oldActor.publishActiveIfCurrent('session-v1')).resolves.toBe(
      'conflict',
    )
    await expect(
      oldActor.publishLogoutIfCurrent('session-v1', 'session-v1-logout'),
    ).resolves.toBe('conflict')
    expect(JSON.parse(storage.getItem(AUTH_SHARED_STATE_KEY)!)).toEqual({
      version: 'session-v2',
      status: 'active',
    })
  })

  it('times out lock acquisition and continues in local-only mode', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    storage.setItem(
      AUTH_SHARED_STATE_KEY,
      JSON.stringify({ version: 'session-v1', status: 'changing' }),
    )
    const stalledEnvironment = environment(storage, null, ['local'])
    stalledEnvironment.requestLock = <T>(signal: AbortSignal) =>
      new Promise<T>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    const coordinator = new CrossTabSessionCoordinator(
      stalledEnvironment,
      () => null,
      vi.fn(),
    )

    const publication = coordinator.publishActiveIfCurrent('session-v1')
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(publication).resolves.toBe('local-only')
    expect(JSON.parse(storage.getItem(AUTH_SHARED_STATE_KEY)!)).toEqual({
      version: 'session-v1',
      status: 'changing',
    })

    stalledEnvironment.requestLock = new LockHub().request
    await expect(
      coordinator.publishState({ version: 'session-v2', status: 'active' }),
    ).resolves.toBe('local-only')
    expect(coordinator.readSharedState()).toBeNull()
    expect(coordinator.isVersionCurrent('session-v2', ['active'])).toBe(true)
    expect(JSON.parse(storage.getItem(AUTH_SHARED_STATE_KEY)!)).toEqual({
      version: 'session-v1',
      status: 'changing',
    })
  })
})
