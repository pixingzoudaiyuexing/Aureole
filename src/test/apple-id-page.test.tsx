import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { buildNavigationItems } from '@/config/navigation'
import {
  appleIdApi,
  type AppleIdAccount,
} from '@/features/apple-id/apple-id-api'
import type { AuthApi } from '@/features/auth/auth-api'
import { ApiError } from '@/lib/api/errors'

const one: AppleIdAccount = {
  username: 'one@example.com',
  status: true,
  lastCheck: 'before',
  remark: 'First',
}
const two: AppleIdAccount = {
  username: 'two@example.com',
  status: false,
  lastCheck: 'older',
  remark: null,
}

afterEach(() => vi.useRealTimers())

function setup(items = [one, two]) {
  const list = vi.spyOn(appleIdApi, 'list').mockResolvedValue({ items })
  const reveal = vi.spyOn(appleIdApi, 'reveal')
  const router = createAppRouter({ initialEntries: ['/apple-id'] })
  const queryClient = createQueryClient()
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: '2030-01-01T00:00:00.000Z',
      status: 'active',
    }),
  }
  const rendered = render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { list, reveal, router, queryClient, ...rendered }
}

function item(username: string) {
  return screen.getByText(username).closest('li')!
}

describe('Apple ID page', () => {
  it('has exact navigation placement and a protected route with hidden passwords', async () => {
    const items = buildNavigationItems([])
      .filter((entry) => entry.kind === 'internal')
      .map((entry) => entry.label)
    expect(
      items.slice(items.indexOf('Resources'), items.indexOf('Orders') + 1),
    ).toEqual(['Resources', 'Apple ID', 'Orders'])
    const { reveal, router } = setup()
    expect(await screen.findByText(one.username)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/apple-id')
    expect(screen.getByText(two.username)).toBeInTheDocument()
    expect(
      within(item(one.username)).getByText('状态：可用'),
    ).toBeInTheDocument()
    expect(
      within(item(one.username)).getByText('最近检查：before'),
    ).toBeInTheDocument()
    expect(
      within(item(one.username)).getByText('备注：First'),
    ).toBeInTheDocument()
    expect(within(item(two.username)).queryByText(/备注：/)).toBeNull()
    expect(within(item(one.username)).getByText('••••••••')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '复制密码' })).toBeNull()
    expect(reveal).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '刷新' })).toBeNull()
  })

  it('reveals fresh response only, reconciles metadata and expires after 10 seconds', async () => {
    const { reveal, queryClient } = setup()
    const user = userEvent.setup()
    const clipboard = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    await screen.findByText(one.username)
    let resolve!: (value: Awaited<ReturnType<typeof appleIdApi.reveal>>) => void
    reveal.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await user.click(
      within(item(one.username)).getByRole('button', { name: '显示密码' }),
    )
    expect(reveal).toHaveBeenCalledWith(expect.any(String), one.username)
    expect(within(item(one.username)).getByText('••••••••')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '复制密码' })).toBeNull()
    vi.useFakeTimers()
    await act(async () =>
      resolve({
        ...one,
        status: false,
        lastCheck: 'after',
        remark: 'Updated',
        password: 'fresh-secret',
      }),
    )
    expect(
      within(item(one.username)).getByText('fresh-secret'),
    ).toBeInTheDocument()
    expect(
      within(item(one.username)).getByText('状态：不可用'),
    ).toBeInTheDocument()
    expect(
      within(item(one.username)).getByText('最近检查：after'),
    ).toBeInTheDocument()
    expect(
      within(item(one.username)).getByText('备注：Updated'),
    ).toBeInTheDocument()
    expect(
      JSON.stringify(queryClient.getQueryData(['apple-ids'])),
    ).not.toContain('fresh-secret')
    await act(async () => vi.advanceTimersByTimeAsync(9_999))
    expect(
      within(item(one.username)).getByText('fresh-secret'),
    ).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(screen.queryByText('fresh-secret')).toBeNull()
    expect(within(item(one.username)).getByText('••••••••')).toBeInTheDocument()
    expect(
      within(item(one.username)).queryByRole('button', { name: '复制密码' }),
    ).toBeNull()
    vi.useRealTimers()
    reveal.mockResolvedValueOnce({ ...one, password: 'second-secret' })
    await user.click(
      within(item(one.username)).getByRole('button', { name: '显示密码' }),
    )
    expect(await screen.findByText('second-secret')).toBeInTheDocument()
    expect(reveal).toHaveBeenCalledTimes(2)
    await user.click(
      within(item(one.username)).getByRole('button', { name: '复制密码' }),
    )
    expect(clipboard).toHaveBeenCalledWith('second-secret')
    await user.click(
      within(item(two.username)).getByRole('button', { name: '复制 Apple ID' }),
    )
    expect(clipboard).toHaveBeenCalledWith(two.username)
  })

  it('clears stale plaintext before a second pending request and on failure', async () => {
    const { reveal } = setup([one])
    reveal.mockResolvedValueOnce({ ...one, password: 'old-secret' })
    const user = userEvent.setup()
    await screen.findByText(one.username)
    await user.click(screen.getByRole('button', { name: '显示密码' }))
    expect(await screen.findByText('old-secret')).toBeInTheDocument()
    let reject!: (error: unknown) => void
    reveal.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    await user.click(screen.getByRole('button', { name: '显示密码' }))
    expect(screen.queryByText('old-secret')).toBeNull()
    expect(screen.queryByRole('button', { name: '复制密码' })).toBeNull()
    await act(async () =>
      reject(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network' }),
      ),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('暂时无法显示密码')
    expect(screen.getByText('••••••••')).toBeInTheDocument()
  })

  it('reconciles 409 without ever attaching another account password', async () => {
    const { reveal, list } = setup()
    reveal.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'APPLE_ID_ACCOUNT_UNAVAILABLE',
        message: 'Unavailable',
      }),
    )
    const user = userEvent.setup()
    await screen.findByText(one.username)
    list.mockResolvedValueOnce({ items: [two] })
    await user.click(
      within(item(one.username)).getByRole('button', { name: '显示密码' }),
    )
    await waitFor(() => expect(screen.queryByText(one.username)).toBeNull())
    expect(screen.getByText(two.username)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '复制密码' })).toBeNull()
  })

  it('clears reveal on navigation and treats a later visit as a fresh reveal', async () => {
    const { reveal, router } = setup([one])
    reveal
      .mockResolvedValueOnce({ ...one, password: 'short-lived' })
      .mockResolvedValueOnce({ ...one, password: 'new-value' })
    const user = userEvent.setup()
    await screen.findByText(one.username)
    await user.click(screen.getByRole('button', { name: '显示密码' }))
    expect(await screen.findByText('short-lived')).toBeInTheDocument()
    await act(async () => router.navigate({ to: '/resources' }))
    await act(async () => router.navigate({ to: '/apple-id' }))
    expect(await screen.findByText(one.username)).toBeInTheDocument()
    expect(screen.queryByText('short-lived')).toBeNull()
    await user.click(screen.getByRole('button', { name: '显示密码' }))
    expect(await screen.findByText('new-value')).toBeInTheDocument()
    expect(reveal).toHaveBeenCalledTimes(2)
  })

  it('shows retry on list error and retains existing auth failure handling', async () => {
    const { list } = setup()
    list
      .mockReset()
      .mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: 'BAD_REQUEST',
          message: 'Unavailable',
        }),
      )
      .mockResolvedValueOnce({ items: [one] })
    const user = userEvent.setup()
    expect(
      await screen.findByText('暂时无法读取 Apple ID。'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText(one.username)).toBeInTheDocument()
  })
})
