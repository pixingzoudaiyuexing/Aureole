import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { CurrentUser } from '@/features/auth/auth-api'
import { ApiError } from '@/lib/api/errors'

const member: CurrentUser = {
  email: 'member@example.com',
  status: 'active',
  expiresAt: null,
  sessionVersion: '11111111-1111-4111-8111-111111111111',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function renderRefresh(
  path: '/dashboard' | '/login',
  session: Promise<CurrentUser>,
) {
  const getCurrentUser = vi.fn(() => session)
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={{ login: vi.fn(), getCurrentUser }}
      queryClient={createQueryClient()}
    />,
  )
  return { getCurrentUser, router }
}

describe('Cold Cookie session restore', () => {
  it('keeps the protected route private while showing normal page loading, then opens without a second session read', async () => {
    const session = deferred<CurrentUser>()
    const { getCurrentUser } = renderRefresh('/dashboard', session.promise)

    expect(
      await screen.findByRole('status', { name: '页面加载中' }),
    ).toBeVisible()
    expect(screen.queryByText('正在验证登录状态')).not.toBeInTheDocument()
    expect(screen.queryByText(member.email)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '概览' }),
    ).not.toBeInTheDocument()
    expect(getCurrentUser).toHaveBeenCalledTimes(1)

    await act(async () => {
      session.resolve(member)
      await session.promise
    })
    expect(await screen.findByRole('heading', { name: '概览' })).toBeVisible()
    expect(
      screen.queryByRole('status', { name: '页面加载中' }),
    ).not.toBeInTheDocument()
    expect(getCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('uses the same neutral loading for a cold public entry, then redirects a valid session', async () => {
    const session = deferred<CurrentUser>()
    const { getCurrentUser } = renderRefresh('/login', session.promise)
    expect(
      await screen.findByRole('status', { name: '页面加载中' }),
    ).toBeVisible()
    expect(screen.queryByText('正在验证登录状态')).not.toBeInTheDocument()
    await act(async () => {
      session.resolve(member)
      await session.promise
    })
    expect(await screen.findByRole('heading', { name: '概览' })).toBeVisible()
    expect(getCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('never opens the private route after confirmed invalidation', async () => {
    const session = deferred<CurrentUser>()
    const { getCurrentUser, router } = renderRefresh(
      '/dashboard',
      session.promise,
    )
    expect(
      await screen.findByRole('status', { name: '页面加载中' }),
    ).toBeVisible()
    await act(async () => {
      session.reject(
        new ApiError({
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'Required',
        }),
      )
      await session.promise.catch(() => undefined)
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(
      screen.queryByRole('heading', { name: '概览' }),
    ).not.toBeInTheDocument()
    expect(getCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('keeps the private route closed when session restore temporarily fails', async () => {
    const session = deferred<CurrentUser>()
    const { getCurrentUser } = renderRefresh('/dashboard', session.promise)
    expect(
      await screen.findByRole('status', { name: '页面加载中' }),
    ).toBeVisible()
    await act(async () => {
      session.reject(
        new ApiError({
          status: 504,
          code: 'UPSTREAM_TIMEOUT',
          message: 'Timeout',
        }),
      )
      await session.promise.catch(() => undefined)
    })
    expect(
      await screen.findByRole('heading', { name: '暂时无法连接服务' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: '概览' }),
    ).not.toBeInTheDocument()
    expect(getCurrentUser).toHaveBeenCalledTimes(1)
  })
})
