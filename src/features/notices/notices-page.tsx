import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { formatAbsoluteDateTime } from '@/features/subscription/subscription-format'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { ApiError } from '@/lib/api/errors'
import type { NoticeSummary } from './notices-api'
import { useNoticeDetail, useNoticeList } from './notices-queries'
import { SafeNoticeHtml } from './safe-notice-html'

const PAGE_SIZE = 20

function NoticeMeta({ notice }: { notice: NoticeSummary }) {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        {formatAbsoluteDateTime(notice.createdAt)}
      </p>
      {notice.tags.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {notice.tags.map((tag, index) => (
            <span
              className="max-w-full break-words rounded-sm border border-border bg-muted px-2 py-1 text-xs"
              key={`${notice.id}-${index}`}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}

export function NoticesPage() {
  const token = useAuthSessionStore((s) => s.accessToken)
  if (!token) return null
  return <NoticesContent token={token} />
}

function NoticesContent({ token }: { token: string }) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)
  const list = useNoticeList(token, page, PAGE_SIZE)
  const detail = useNoticeDetail(token, selectedId)
  const invalid = isInvalidSessionError(list.error)
    ? list.error
    : isInvalidSessionError(detail.error)
      ? detail.error
      : null
  useExitOnInvalidSessionError(invalid)
  if (invalid) return null
  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize))
    : 1

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">公告中心</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">公告</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          查看服务发布的公告与详细内容。
        </p>
      </div>
      <section
        className="border-t border-border py-8"
        aria-labelledby="notice-list-title"
      >
        <h3 id="notice-list-title" className="mb-5 text-base font-semibold">
          公告列表
        </h3>
        {list.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在读取公告…
          </p>
        ) : list.isError ? (
          <ReadError
            message="暂时无法读取公告。"
            error={list.error}
            retry={() => void list.refetch()}
          />
        ) : list.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">当前没有公告。</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {list.data.items.map((notice) => (
              <button
                type="button"
                className="block min-h-20 w-full px-1 py-4 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                key={notice.id}
                onClick={(event) => {
                  selectedTriggerRef.current = event.currentTarget
                  setSelectedId(notice.id)
                }}
              >
                <h4 className="break-words text-sm font-semibold">
                  {notice.title}
                </h4>
                <div className="mt-2">
                  <NoticeMeta notice={notice} />
                </div>
              </button>
            ))}
          </div>
        )}
        {list.data ? (
          <div className="mt-6 flex items-center justify-between gap-4">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              上一页
            </Button>
            <p className="text-sm" aria-live="polite">
              第 {list.data.page} / {totalPages} 页
            </p>
            <Button
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((v) => v + 1)}
            >
              下一页
            </Button>
          </div>
        ) : null}
      </section>
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <DialogContent
          closeLabel="关闭公告"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            selectedTriggerRef.current?.focus()
            selectedTriggerRef.current = null
          }}
        >
          <div className="border-b border-border px-6 py-5 pr-16">
            <DialogTitle className="break-words text-lg font-semibold">
              {detail.data?.title ?? '公告详情'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              查看公告正文和发布时间。
            </DialogDescription>
          </div>
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {detail.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                正在读取公告详情…
              </p>
            ) : detail.isError ? (
              detail.error instanceof ApiError &&
              detail.error.code === 'NOTICE_NOT_FOUND' ? (
                <p role="alert" className="text-sm">
                  该公告不存在或已不可用。
                </p>
              ) : (
                <ReadError
                  message="暂时无法读取公告详情。"
                  error={detail.error}
                  retry={() => void detail.refetch()}
                />
              )
            ) : detail.data ? (
              <>
                <NoticeMeta notice={detail.data} />
                <div className="mt-6">
                  <SafeNoticeHtml html={detail.data.content} />
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
