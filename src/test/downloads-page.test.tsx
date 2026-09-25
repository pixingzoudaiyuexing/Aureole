import type { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi } from '@/features/auth/auth-api'
import {
  downloadsApi,
  type DownloadsData,
} from '@/features/downloads/downloads-api'
import { ApiError } from '@/lib/api/errors'

const data: DownloadsData = {
  items: [
    {
      id: 'windows',
      label: 'Windows Client',
      platform: 'windows',
      arch: 'x64',
      version: '1.2.3',
      publishedAt: '2026-09-25T00:00:00.000Z',
      filename: 'client-windows-x64.exe',
      sizeBytes: 42_000_000,
      downloads: [
        { id: 'w-fast', label: '高速下载', url: 'https://fast.example.com/w' },
        {
          id: 'w-backup',
          label: '备用下载',
          url: 'https://backup.example.com/w',
        },
      ],
    },
    {
      id: 'macos',
      label: 'macOS Client',
      platform: 'macos',
      arch: null,
      version: '1.2.3',
      publishedAt: null,
      filename: 'client-macos.dmg',
      sizeBytes: 42_000_000,
      downloads: [
        { id: 'm-fast', label: 'Mac 下载', url: 'https://fast.example.com/m' },
        {
          id: 'm-backup',
          label: 'Mac 备用',
          url: 'https://backup.example.com/m',
        },
      ],
    },
    {
      id: 'android',
      label: 'Android Client',
      platform: 'android',
      arch: null,
      version: '1.2.3',
      publishedAt: null,
      filename: 'client-android.apk',
      sizeBytes: 42_000_000,
      downloads: [
        {
          id: 'a-fast',
          label: 'Android 下载',
          url: 'https://fast.example.com/a',
        },
        {
          id: 'a-backup',
          label: 'Android 备用',
          url: 'https://backup.example.com/a',
        },
      ],
    },
    {
      id: 'linux-x64',
      label: 'Debian / Ubuntu',
      platform: 'linux',
      arch: 'x64',
      version: '1.2.3',
      publishedAt: null,
      filename:
        'a-very-long-linux-client-filename-that-must-wrap-cleanly.tar.gz',
      sizeBytes: 42_000_000,
      downloads: [
        {
          id: 'l1-fast',
          label: 'Linux 下载',
          url: 'https://fast.example.com/l1',
        },
        {
          id: 'l1-backup',
          label: 'Linux 备用',
          url: 'https://backup.example.com/l1',
        },
      ],
    },
    {
      id: 'linux-arm64',
      label: 'Fedora / RHEL with a deliberately long descriptive label',
      platform: 'linux',
      arch: 'ARM64',
      version: '1.2.3',
      publishedAt: null,
      filename: 'client-linux-arm64.tar.gz',
      sizeBytes: 42_000_000,
      downloads: [
        {
          id: 'l2-fast',
          label: 'Linux ARM 下载',
          url: 'https://fast.example.com/l2',
        },
        {
          id: 'l2-backup',
          label: 'Linux ARM 备用',
          url: 'https://backup.example.com/l2',
        },
      ],
    },
  ],
}

function renderRoute(
  path: '/downloads' | '/login' = '/downloads',
  queryClient: QueryClient = createQueryClient(),
) {
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'No session',
      }),
    ),
  }
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { router }
}

describe('Downloads page', () => {
  it('provides a public-site link from sign in to the download center', async () => {
    vi.spyOn(downloadsApi, 'getDownloads').mockResolvedValue(data)
    const user = userEvent.setup()
    const { router } = renderRoute('/login')

    const link = await screen.findByRole('link', { name: '下载中心' })
    expect(link).toHaveAttribute('href', '/downloads')
    await user.click(link)

    expect(
      await screen.findByRole('heading', { name: '下载中心' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/downloads')
  })

  it('shows a local loading state while the anonymous query is pending', async () => {
    let resolveDownloads: ((value: DownloadsData) => void) | undefined
    vi.spyOn(downloadsApi, 'getDownloads').mockImplementation(
      () =>
        new Promise<DownloadsData>((resolve) => {
          resolveDownloads = resolve
        }),
    )
    renderRoute()

    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(
      '正在读取可用下载',
    )
    resolveDownloads?.(data)
  })

  it('is public and renders ordered platform sections with two safe external actions', async () => {
    vi.spyOn(downloadsApi, 'getDownloads').mockResolvedValue(data)
    const { router } = renderRoute()

    expect(
      await screen.findByRole('heading', { name: 'Windows' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/downloads')
    expect(screen.getByRole('heading', { name: 'macOS' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Android' })).toBeInTheDocument()

    const linux = screen.getByRole('region', { name: 'Linux GUI' })
    expect(within(linux).getAllByRole('heading', { level: 3 })).toHaveLength(2)
    const firstLinux = within(linux).getByText('Debian / Ubuntu')
    const secondLinux = within(linux).getByText(
      'Fedora / RHEL with a deliberately long descriptive label',
    )
    expect(
      firstLinux.compareDocumentPosition(secondLinux) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    const primary = screen.getByRole('link', { name: '高速下载' })
    const secondary = screen.getByRole('link', { name: '备用下载' })
    expect(primary).toHaveAttribute('href', 'https://fast.example.com/w')
    expect(primary).toHaveAttribute('target', '_blank')
    expect(primary).toHaveAttribute('rel', 'noopener noreferrer')
    expect(primary).toHaveClass('bg-primary')
    expect(secondary).toHaveClass('border')
    expect(screen.getByText(/client-macos\.dmg/)).toBeInTheDocument()
    expect(screen.getByText(/a-very-long-linux-client-filename/)).toHaveClass(
      'break-all',
    )
  })

  it('shows a neutral empty state', async () => {
    vi.spyOn(downloadsApi, 'getDownloads').mockResolvedValue({ items: [] })
    renderRoute()

    expect(await screen.findByText('当前没有可用下载。')).toBeInTheDocument()
  })

  it('shows a local error and recovers through manual retry', async () => {
    const getDownloads = vi
      .spyOn(downloadsApi, 'getDownloads')
      .mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: 'DOWNLOADS_UNAVAILABLE',
          message: 'No',
        }),
      )
      .mockResolvedValueOnce(data)
    const user = userEvent.setup()
    renderRoute()

    expect(
      await screen.findByText('暂时无法读取下载内容。'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('Windows Client')).toBeInTheDocument()
    await waitFor(() => expect(getDownloads).toHaveBeenCalledTimes(2))
  })
})
