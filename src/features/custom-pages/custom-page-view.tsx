import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CustomPage } from '@/config/custom-pages'

export function CustomPageView({ page }: { page: CustomPage | null }) {
  if (!page) return <CustomPageUnavailable />
  return <CustomPageFrame key={`${page.id}:${page.url}`} page={page} />
}

function CustomPageFrame({ page }: { page: CustomPage }) {
  const [loading, setLoading] = useState(true)

  return (
    <section
      className="flex min-h-0 w-full flex-1 flex-col"
      aria-labelledby="custom-page-title"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 id="custom-page-title" className="truncate text-sm font-semibold">
            {page.title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            如果页面无法正常显示，请在新窗口打开。
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={page.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" aria-hidden="true" />
            在新窗口打开
          </a>
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 bg-muted/30">
        {loading ? (
          <p
            className="absolute inset-x-4 top-4 z-10 text-sm text-muted-foreground sm:inset-x-6"
            role="status"
          >
            正在加载页面…
          </p>
        ) : null}
        <iframe
          key={page.url}
          src={page.url}
          title={page.title}
          referrerPolicy="no-referrer"
          className="h-full min-h-96 w-full border-0 bg-background"
          onLoad={() => setLoading(false)}
        />
      </div>
    </section>
  )
}

function CustomPageUnavailable() {
  return (
    <section className="flex min-h-0 w-full flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div
        className="max-w-lg border-l-2 border-foreground/40 pl-4"
        role="alert"
      >
        <h2 className="text-base font-semibold">页面不可用</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          此页面不存在、未启用，或不支持在 Aureole 内打开。
        </p>
      </div>
    </section>
  )
}
