import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { Brand } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { ReadError } from '@/components/shared/read-error'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DownloadItem } from './downloads-api'
import { useDownloads } from './downloads-queries'

const platformSections = [
  { platform: 'windows', title: 'Windows' },
  { platform: 'macos', title: 'macOS' },
  { platform: 'android', title: 'Android' },
  { platform: 'linux', title: 'Linux GUI' },
] as const

function formatFileSize(sizeBytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = sizeBytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function formatPublishedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function DownloadCard({ item }: { item: DownloadItem }) {
  const metadata = [
    `版本 ${item.version}`,
    ...(item.arch ? [item.arch] : []),
    item.filename,
    formatFileSize(item.sizeBytes),
    ...(item.publishedAt ? [formatPublishedAt(item.publishedAt)] : []),
  ]

  return (
    <article className="border-b border-border py-6 last:border-b-0">
      <h3 className="break-words text-base font-semibold text-foreground">
        {item.label}
      </h3>
      <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
        {metadata.join(' · ')}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {item.downloads.map((download, index) => (
          <a
            className={cn(
              buttonVariants({
                variant: index === 0 ? 'default' : 'outline',
                size: 'sm',
              }),
              'max-w-full break-words whitespace-normal',
            )}
            href={download.url}
            key={download.id}
            rel="noopener noreferrer"
            target="_blank"
          >
            {index === 0 ? (
              <Download className="size-4" aria-hidden="true" />
            ) : null}
            {download.label}
          </a>
        ))}
      </div>
    </article>
  )
}

export function DownloadsPage() {
  const downloads = useDownloads()

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
        <Link
          to="/login"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Brand />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-primary">客户端</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">下载中心</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            获取适用于你设备的客户端。下载链接由服务端提供。
          </p>
        </div>

        <section
          className="mt-10 border-t border-border"
          aria-label="客户端列表"
        >
          {downloads.isPending ? (
            <p className="py-8 text-sm text-muted-foreground" role="status">
              正在读取可用下载…
            </p>
          ) : downloads.isError ? (
            <div className="py-8">
              <ReadError
                message="暂时无法读取下载内容。"
                error={downloads.error}
                retry={() => void downloads.refetch()}
              />
            </div>
          ) : downloads.data.items.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              当前没有可用下载。
            </p>
          ) : (
            platformSections.map(({ platform, title }) => {
              const items = downloads.data.items.filter(
                (item) => item.platform === platform,
              )
              if (items.length === 0) return null

              return (
                <section
                  className="border-b border-border py-8 first:pt-8"
                  key={platform}
                  aria-labelledby={`downloads-${platform}`}
                >
                  <h2
                    className="text-lg font-semibold text-foreground"
                    id={`downloads-${platform}`}
                  >
                    {title}
                  </h2>
                  <div className="mt-2 divide-y divide-border">
                    {items.map((item) => (
                      <DownloadCard item={item} key={item.id} />
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </section>
      </main>

      <footer className="border-t border-border px-6 py-5 text-center text-xs text-muted-foreground">
        <Link
          to="/login"
          className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          返回登录
        </Link>
      </footer>
    </div>
  )
}
