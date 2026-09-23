import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { announcementsApi } from '@/features/announcements/announcements-api'
import { announcementsQueryKeys } from '@/features/announcements/announcements-queries'
import { ApiError } from '@/lib/api/errors'

const oldUser: CurrentUser = {
  email: 'old@example.com',
  status: 'active',
  expiresAt: null,
  sessionVersion: '11111111-1111-4111-8111-111111111111',
}
const newUser: CurrentUser = {
  ...oldUser,
  email: 'new@example.com',
  sessionVersion: '22222222-2222-4222-8222-222222222222',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Announcements after session changes', () => {
  it('removes private announcements on logout and fetches public ones without retry', async () => {
    let current: CurrentUser | null = oldUser
    const api: AuthApi = {
      login: vi.fn(),
      getCurrentUser: vi.fn(async () => {
        if (!current)
          throw new ApiError({
            status: 401,
            code: 'AUTH_FAILED',
            message: 'Session revoked',
          })
        return current
      }),
      logout: vi.fn(async () => {
        current = null
      }),
    }
    const announcements = vi
      .spyOn(announcementsApi, 'getAnnouncements')
      .mockImplementation(async (accessToken) => ({
        items: [
          {
            id: accessToken ? 'private' : 'public',
            title: accessToken ? 'Private notice' : 'Public notice',
            body: 'Notice body',
          },
        ],
      }))
    const queryClient = createQueryClient()
    const router = createAppRouter({ initialEntries: ['/dashboard'] })
    render(
      <AppProviders router={router} authApi={api} queryClient={queryClient} />,
    )

    expect(await screen.findByText('Private notice')).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '退出登录' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(await screen.findByText('Public notice')).toBeInTheDocument()
    expect(screen.queryByText('Private notice')).not.toBeInTheDocument()
    expect(
      queryClient.getQueryData(announcementsQueryKeys.authenticated),
    ).toBeUndefined()
    expect(queryClient.getQueryData(announcementsQueryKeys.public)).toEqual({
      items: [{ id: 'public', title: 'Public notice', body: 'Notice body' }],
    })
    expect(announcements).toHaveBeenCalledWith(undefined)
    expect(announcements).toHaveBeenCalledWith(expect.any(String))
  })

  it('does not refill old private announcements after another account becomes current', async () => {
    const late = deferred<{
      items: { id: string; title: string; body: string }[]
    }>()
    let current: CurrentUser | null = oldUser
    const api: AuthApi = {
      login: vi.fn(async () => {
        current = newUser
        return newUser
      }),
      getCurrentUser: vi.fn(async () => {
        if (!current)
          throw new ApiError({
            status: 401,
            code: 'AUTH_FAILED',
            message: 'Session revoked',
          })
        return current
      }),
      logout: vi.fn(async () => {
        current = null
      }),
    }
    const announcements = vi
      .spyOn(announcementsApi, 'getAnnouncements')
      .mockImplementationOnce(() => late.promise)
      .mockImplementation(async (accessToken) => ({
        items: [
          accessToken
            ? { id: 'new', title: 'New private notice', body: 'New' }
            : { id: 'public', title: 'Public notice', body: 'Public' },
        ],
      }))
    const queryClient = createQueryClient()
    const router = createAppRouter({ initialEntries: ['/dashboard'] })
    render(
      <AppProviders router={router} authApi={api} queryClient={queryClient} />,
    )
    await waitFor(() => expect(announcements).toHaveBeenCalledTimes(1))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '退出登录' }))
    expect(await screen.findByText('Public notice')).toBeInTheDocument()
    await user.type(screen.getByLabelText('邮箱'), newUser.email)
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(await screen.findByText('New private notice')).toBeInTheDocument()
    expect(
      queryClient.getQueryData(announcementsQueryKeys.public),
    ).toBeUndefined()
    await act(async () => {
      late.resolve({
        items: [{ id: 'old', title: 'Old private notice', body: 'Old' }],
      })
      await late.promise
    })
    expect(screen.queryByText('Old private notice')).not.toBeInTheDocument()
    expect(
      queryClient.getQueryData(announcementsQueryKeys.authenticated),
    ).toEqual({
      items: [{ id: 'new', title: 'New private notice', body: 'New' }],
    })
  })
})
