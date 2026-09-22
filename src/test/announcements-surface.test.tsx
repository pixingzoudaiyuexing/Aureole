import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnnouncementsSurface } from '@/features/announcements/announcements-surface'
import { announcementsApi } from '@/features/announcements/announcements-api'
import { useAuth } from '@/features/auth/auth-context'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { ApiError } from '@/lib/api/errors'

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function renderSurface() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <AnnouncementsSurface />
    </QueryClientProvider>,
  )
}

describe('AnnouncementsSurface', () => {
  it('renders ordered plain text announcements', async () => {
    mockedUseAuth.mockReturnValue({ status: 'unauthenticated' } as never)
    vi.spyOn(announcementsApi, 'getAnnouncements').mockResolvedValue({
      items: [
        { id: 'first', title: '<First>', body: '<script>bad()</script>' },
        { id: 'second', title: 'Second', body: '**plain text**' },
      ],
    })

    renderSurface()

    expect(
      await screen.findByRole('heading', { name: '<First>' }),
    ).toBeInTheDocument()
    expect(screen.getByText('<script>bad()</script>')).toBeInTheDocument()
    expect(screen.getByText('**plain text**')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect(
      screen
        .getByRole('heading', { name: '<First>' })
        .compareDocumentPosition(
          screen.getByRole('heading', { name: 'Second' }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not render an empty list as an error', async () => {
    mockedUseAuth.mockReturnValue({ status: 'unauthenticated' } as never)
    vi.spyOn(announcementsApi, 'getAnnouncements').mockResolvedValue({
      items: [],
    })

    renderSurface()

    await waitFor(() =>
      expect(announcementsApi.getAnnouncements).toHaveBeenCalled(),
    )
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.queryByRole('region', { name: 'Announcements' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders a retryable read error without invalidating anonymous auth', async () => {
    const retry = vi
      .spyOn(announcementsApi, 'getAnnouncements')
      .mockRejectedValue(new Error('network'))
    const logout = vi.fn()
    mockedUseAuth.mockReturnValue({
      status: 'unauthenticated',
      logout,
    } as never)

    renderSurface()

    expect(
      await screen.findByText('Unable to read announcements.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(logout).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalled()
  })

  it('reuses invalid-session behavior only for authenticated auth errors', async () => {
    const logout = vi.fn()
    mockedUseAuth.mockReturnValue({ status: 'authenticated', logout } as never)
    useAuthSessionStore.setState({
      accessToken: 'session-token',
      hydrated: true,
    })
    vi.spyOn(announcementsApi, 'getAnnouncements').mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      }),
    )

    renderSurface()

    await waitFor(() => expect(logout).toHaveBeenCalled())
    expect(screen.queryByText('Unable to read announcements.')).toBeNull()
  })

  it('does not invalidate authenticated sessions for upstream read errors', async () => {
    const logout = vi.fn()
    mockedUseAuth.mockReturnValue({ status: 'authenticated', logout } as never)
    useAuthSessionStore.setState({
      accessToken: 'session-token',
      hydrated: true,
    })
    vi.spyOn(announcementsApi, 'getAnnouncements').mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'UPSTREAM_ERROR',
        message: 'upstream unavailable',
      }),
    )

    renderSurface()

    expect(
      await screen.findByText('Unable to read announcements.'),
    ).toBeInTheDocument()
    expect(logout).not.toHaveBeenCalled()
  })
})
