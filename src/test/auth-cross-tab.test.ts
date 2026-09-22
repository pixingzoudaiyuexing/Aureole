import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_SHARED_STATE_KEY,
  CrossTabSessionCoordinator,
  type CrossTabSessionEnvironment,
  type LocalShareableSession,
} from '@/lib/auth/cross-tab-session'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
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
  private hub: ChannelHub
  constructor(hub: ChannelHub) {
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
): CrossTabSessionEnvironment {
  const listeners = new Map<string, EventListener>()
  const documentListeners = new Map<string, EventListener>()
  return {
    storage,
    createChannel: hub
      ? () => hub.create() as unknown as BroadcastChannel
      : null,
    addWindowListener: ((type: string, listener: EventListener) => {
      listeners.set(type, listener)
    }) as typeof window.addEventListener,
    removeWindowListener: ((type: string) => {
      listeners.delete(type)
    }) as typeof window.removeEventListener,
    document: {
      visibilityState: 'visible',
      addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
      ) => documentListeners.set(type, listener as EventListener),
      removeEventListener: (type: string) => documentListeners.delete(type),
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
    publisher.publishState({ version: 'logout-v2', status: 'logged-out' })
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
    expect(() =>
      fallback.publishState({ version: 'v3', status: 'active' }),
    ).not.toThrow()
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
})
