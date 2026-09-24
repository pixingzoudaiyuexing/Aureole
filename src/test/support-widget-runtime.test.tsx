import { act, render, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'

const id = '12345678-1234-1234-1234-123456789abc'
const scriptUrl = 'https://client.crisp.chat/l.js'

async function renderEffects(
  getConfig: () => Promise<
    | { crisp: { enabled: false } }
    | { crisp: { enabled: true; websiteId: string } }
  >,
) {
  vi.resetModules()
  const { supportWidgetApi } =
    await import('@/features/support-widget/support-widget-api')
  vi.spyOn(supportWidgetApi, 'getConfig').mockImplementation(getConfig)
  const { SupportWidgetRuntimeEffects } =
    await import('@/features/support-widget/support-widget-runtime-effects')
  const runtime =
    await import('@/features/support-widget/support-widget-runtime')
  runtime.setSupportWidgetIdentityReady(true)
  const client = createQueryClient()
  const view = render(
    <QueryClientProvider client={client}>
      <SupportWidgetRuntimeEffects />
    </QueryClientProvider>,
  )
  return { client, runtime, Effects: SupportWidgetRuntimeEffects, ...view }
}

beforeEach(() => {
  delete window.$crisp
  delete window.CRISP_WEBSITE_ID
  document.querySelectorAll(`script[src="${scriptUrl}"]`).forEach((script) => {
    script.remove()
  })
})

describe('Crisp lifecycle', () => {
  it('does not initialize for disabled or failed config', async () => {
    const disabled = await renderEffects(async () => ({
      crisp: { enabled: false },
    }))
    await waitFor(() =>
      expect(
        disabled.client.getQueryData(['support-widget', 'public']),
      ).toEqual({ crisp: { enabled: false } }),
    )
    expect(document.querySelector(`script[src="${scriptUrl}"]`)).toBeNull()
    disabled.unmount()

    const failed = await renderEffects(async () => {
      throw new Error('offline')
    })
    await waitFor(() =>
      expect(
        failed.client.getQueryState(['support-widget', 'public'])?.status,
      ).toBe('error'),
    )
    expect(document.querySelector(`script[src="${scriptUrl}"]`)).toBeNull()
    failed.unmount()
  })

  it('loads the official script once and hides when disabled', async () => {
    const view = await renderEffects(async () => ({
      crisp: { enabled: true, websiteId: id },
    }))
    await waitFor(() =>
      expect(
        document.querySelectorAll(`script[src="${scriptUrl}"]`),
      ).toHaveLength(1),
    )
    expect(window.CRISP_WEBSITE_ID).toBe(id)
    expect(window.$crisp).toContainEqual(['do', 'chat:show'])
    view.rerender(
      <QueryClientProvider client={view.client}>
        <view.Effects />
      </QueryClientProvider>,
    )
    expect(
      document.querySelectorAll(`script[src="${scriptUrl}"]`),
    ).toHaveLength(1)

    act(() =>
      view.client.setQueryData(['support-widget', 'public'], {
        crisp: { enabled: false },
      }),
    )
    await waitFor(() =>
      expect(window.$crisp).toContainEqual(['do', 'session:reset']),
    )
    expect(window.$crisp).toContainEqual(['do', 'chat:hide'])
    view.unmount()
  })

  it('keeps cached enabled data hidden after a refresh failure', async () => {
    const getConfig = vi
      .fn()
      .mockResolvedValueOnce({ crisp: { enabled: true, websiteId: id } })
      .mockRejectedValue(new Error('offline'))
    const view = await renderEffects(getConfig)
    await waitFor(() =>
      expect(
        document.querySelectorAll(`script[src="${scriptUrl}"]`),
      ).toHaveLength(1),
    )
    const push = vi.spyOn(window.$crisp!, 'push')

    await act(async () => {
      await view.client.refetchQueries({
        queryKey: ['support-widget', 'public'],
      })
    })

    expect(
      view.client.getQueryState(['support-widget', 'public'])?.status,
    ).toBe('error')
    await waitFor(() => expect(push).toHaveBeenCalledWith(['do', 'chat:hide']))
    push.mockClear()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(push).not.toHaveBeenCalledWith(['do', 'chat:show'])
    view.unmount()
  })

  it('resets the Crisp session on auth isolation', async () => {
    const view = await renderEffects(async () => ({
      crisp: { enabled: true, websiteId: id },
    }))
    await waitFor(() => expect(window.CRISP_WEBSITE_ID).toBe(id))
    const push = vi.spyOn(window.$crisp!, 'push')

    act(() => view.runtime.isolateSupportWidgetSession())

    expect(push).toHaveBeenCalledWith(['do', 'chat:hide'])
    expect(push).toHaveBeenCalledWith(['do', 'chat:close'])
    expect(push).toHaveBeenCalledWith(['do', 'session:reset'])
    view.unmount()
  })
})
