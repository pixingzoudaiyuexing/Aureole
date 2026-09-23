import { act, render, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'
import { supportWidgetApi } from '@/features/support-widget/support-widget-api'
import { SupportWidgetRuntimeEffects } from '@/features/support-widget/support-widget-runtime-effects'
import {
  disableSupportWidget,
  enableSupportWidget,
  isolateSupportWidgetSession,
  setSupportWidgetIdentityReady,
} from '@/features/support-widget/support-widget-runtime'
import {
  advanceAuthSessionGeneration,
  useAuthSessionStore,
} from '@/lib/auth/session-store'

const id = '12345678-1234-1234-1234-123456789abc'
const sdk = vi.hoisted(() => ({
  configure: vi.fn(),
  load: vi.fn(),
  chat: { hide: vi.fn(), show: vi.fn(), close: vi.fn() },
  session: { reset: vi.fn() },
}))
vi.mock('crisp-sdk-web', () => ({ Crisp: sdk }))

function renderEffects() {
  const client = createQueryClient()
  const view = render(
    <QueryClientProvider client={client}>
      <SupportWidgetRuntimeEffects />
    </QueryClientProvider>,
  )
  return { client, ...view }
}

beforeEach(() => {
  vi.clearAllMocks()
  disableSupportWidget()
  setSupportWidgetIdentityReady(true)
  useAuthSessionStore.setState({
    hydrated: true,
    validated: false,
    accessToken: null,
  })
})

describe('Crisp lifecycle', () => {
  it('does not import or initialize for disabled, missing, error or malformed config', async () => {
    vi.spyOn(supportWidgetApi, 'getConfig').mockResolvedValueOnce({
      crisp: { enabled: false },
    })
    const disabled = renderEffects()
    await waitFor(() =>
      expect(
        disabled.client.getQueryData(['support-widget', 'public']),
      ).toEqual({ crisp: { enabled: false } }),
    )
    expect(sdk.configure).not.toHaveBeenCalled()
    disabled.unmount()

    vi.spyOn(supportWidgetApi, 'getConfig').mockRejectedValue(
      new Error('offline'),
    )
    const failed = renderEffects()
    await waitFor(() =>
      expect(
        failed.client.getQueryState(['support-widget', 'public'])?.status,
      ).toBe('error'),
    )
    expect(sdk.configure).not.toHaveBeenCalled()
    failed.unmount()
  })

  it('loads once for a valid config, stays stable across rerenders and hides on disable', async () => {
    vi.spyOn(supportWidgetApi, 'getConfig').mockResolvedValue({
      crisp: { enabled: true, websiteId: id },
    })
    const view = renderEffects()
    await waitFor(() => expect(sdk.load).toHaveBeenCalledTimes(1))
    expect(sdk.configure).toHaveBeenCalledWith(id, { autoload: false })
    expect(sdk.chat.show).toHaveBeenCalledTimes(1)
    view.rerender(
      <QueryClientProvider client={view.client}>
        <SupportWidgetRuntimeEffects />
      </QueryClientProvider>,
    )
    expect(sdk.load).toHaveBeenCalledTimes(1)
    act(() =>
      view.client.setQueryData(['support-widget', 'public'], {
        crisp: { enabled: false },
      }),
    )
    await waitFor(() => expect(sdk.chat.hide).toHaveBeenCalled())
    view.unmount()
  })

  it('hides and resets on auth generation changes without sending user attributes', async () => {
    vi.spyOn(supportWidgetApi, 'getConfig').mockResolvedValue({
      crisp: { enabled: true, websiteId: id },
    })
    const view = renderEffects()
    await waitFor(() =>
      expect(
        view.client.getQueryState(['support-widget', 'public'])?.status,
      ).toBe('success'),
    )
    enableSupportWidget(id)
    expect(sdk.chat.hide).toHaveBeenCalled()
    act(() => {
      isolateSupportWidgetSession()
      advanceAuthSessionGeneration()
    })
    expect(sdk.session.reset).toHaveBeenCalled()
    expect(sdk.chat.hide).toHaveBeenCalled()
    expect(
      sdk.configure.mock.calls.every(
        ([, options]) =>
          JSON.stringify(options) === JSON.stringify({ autoload: false }),
      ),
    ).toBe(true)
    view.unmount()
  })
})
