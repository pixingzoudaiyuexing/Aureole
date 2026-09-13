import { RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { formatAbsoluteDateTime } from '@/features/subscription/subscription-format'
import { ApiError } from '@/lib/api/errors'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { cn } from '@/lib/utils'
import type {
  TicketMessage,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from './tickets-api'
import { TicketCreateControl } from './ticket-create-control'
import { useTicketDetail, useTickets } from './tickets-queries'

const priorityLabels: Record<TicketPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
}

const statusLabels: Record<TicketStatus, string> = {
  open: '处理中',
  closed: '已关闭',
}

const priorityStyles: Record<TicketPriority, string> = {
  low: 'border-border bg-background text-muted-foreground',
  normal: 'border-primary/30 bg-primary/10 text-foreground',
  high: 'border-destructive/30 bg-destructive/10 text-destructive',
}

function TicketBadge({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full rounded-sm border px-2 py-1 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <TicketBadge className={priorityStyles[priority]}>
      {priorityLabels[priority]}
    </TicketBadge>
  )
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <TicketBadge
      className={
        status === 'open'
          ? 'border-primary/30 bg-primary/10 text-foreground'
          : 'border-border bg-muted text-muted-foreground'
      }
    >
      {statusLabels[status]}
    </TicketBadge>
  )
}

function DetailField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium">{children}</dd>
    </div>
  )
}

function TicketMessageItem({ message }: { message: TicketMessage }) {
  const sender = message.fromMe ? '我' : '客服'
  return (
    <article
      aria-label={`${sender}的回复`}
      className={cn(
        'w-fit max-w-[92%] rounded-md border px-4 py-3 sm:max-w-[82%]',
        message.fromMe
          ? 'ml-auto border-primary/30 bg-primary/10'
          : 'mr-auto border-border bg-muted/70',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold">{sender}</p>
        <time className="text-xs text-muted-foreground">
          {formatAbsoluteDateTime(message.createdAt)}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
        {message.content}
      </p>
    </article>
  )
}

export function TicketsPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <TicketsContent accessToken={accessToken} />
}

function TicketsContent({ accessToken }: { accessToken: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)
  const tickets = useTickets(accessToken)
  const detail = useTicketDetail(accessToken, selectedId)
  const invalid = isInvalidSessionError(tickets.error)
    ? tickets.error
    : isInvalidSessionError(detail.error)
      ? detail.error
      : null
  useExitOnInvalidSessionError(invalid)

  if (invalid) return null
  const ticketListAuthorityReady = tickets.isSuccess && !tickets.isFetching

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">客户支持</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Support</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          查看你的支持工单和回复记录。
        </p>
        <TicketCreateControl
          accessToken={accessToken}
          listAuthorityReady={ticketListAuthorityReady}
        />
      </div>

      <section
        className="border-t border-border py-8"
        aria-labelledby="ticket-list-title"
      >
        <div className="mb-6">
          <h3 id="ticket-list-title" className="text-base font-semibold">
            工单列表
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            选择工单查看完整回复记录。
          </p>
        </div>

        {tickets.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在读取支持工单…
          </p>
        ) : tickets.isError ? (
          <ReadError
            message="暂时无法读取支持工单。"
            error={tickets.error}
            retry={() => void tickets.refetch()}
          />
        ) : tickets.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无支持工单。</p>
        ) : (
          <div className="border-y border-border">
            <div
              className="hidden grid-cols-[minmax(12rem,1.4fr)_minmax(6rem,0.45fr)_minmax(7rem,0.5fr)_minmax(10rem,0.75fr)] gap-5 border-b border-border py-3 text-xs font-medium text-muted-foreground sm:grid"
              aria-hidden="true"
            >
              <span>主题</span>
              <span>优先级</span>
              <span>状态</span>
              <span>更新时间</span>
            </div>
            <div className="divide-y divide-border">
              {tickets.data.map((ticket) => (
                <TicketListItem
                  key={ticket.id}
                  ticket={ticket}
                  selected={selectedId === ticket.id}
                  onSelect={(trigger) => {
                    selectedTriggerRef.current = trigger
                    setSelectedId(ticket.id)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <DialogContent
          closeLabel="关闭工单详情"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            selectedTriggerRef.current?.focus()
            selectedTriggerRef.current = null
          }}
        >
          <div className="border-b border-border px-6 py-5 pr-16">
            <DialogTitle className="break-words text-lg font-semibold [overflow-wrap:anywhere]">
              {detail.data?.subject ?? '工单详情'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              查看工单状态和回复记录。
            </DialogDescription>
          </div>
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {detail.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                正在读取工单详情…
              </p>
            ) : detail.isError ? (
              detail.error instanceof ApiError &&
              detail.error.code === 'TICKET_NOT_FOUND' ? (
                <div className="space-y-4" role="alert">
                  <p className="text-sm">该工单不存在或已不可用。</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedId(null)
                      void tickets.refetch()
                    }}
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    重新读取工单列表
                  </Button>
                </div>
              ) : (
                <ReadError
                  message="暂时无法读取工单详情。"
                  error={detail.error}
                  retry={() => void detail.refetch()}
                />
              )
            ) : detail.data ? (
              <>
                <dl className="divide-y divide-border border-y border-border">
                  <DetailField label="工单编号">
                    <span className="break-all font-mono">
                      {detail.data.id}
                    </span>
                  </DetailField>
                  <DetailField label="优先级">
                    <PriorityBadge priority={detail.data.priority} />
                  </DetailField>
                  <DetailField label="状态">
                    <StatusBadge status={detail.data.status} />
                  </DetailField>
                  <DetailField label="创建时间">
                    {formatAbsoluteDateTime(detail.data.createdAt)}
                  </DetailField>
                  <DetailField label="更新时间">
                    {formatAbsoluteDateTime(detail.data.updatedAt)}
                  </DetailField>
                </dl>

                <section
                  className="mt-7"
                  aria-labelledby="ticket-messages-title"
                >
                  <h3
                    id="ticket-messages-title"
                    className="text-base font-semibold"
                  >
                    回复记录
                  </h3>
                  {detail.data.messages.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      暂无回复记录。
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {detail.data.messages.map((message) => (
                        <TicketMessageItem key={message.id} message={message} />
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TicketListItem({
  ticket,
  selected,
  onSelect,
}: {
  ticket: TicketSummary
  selected: boolean
  onSelect: (trigger: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'grid min-h-20 w-full min-w-0 gap-3 py-4 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(12rem,1.4fr)_minmax(6rem,0.45fr)_minmax(7rem,0.5fr)_minmax(10rem,0.75fr)] sm:items-center sm:gap-5',
        selected && 'bg-muted/70',
      )}
      onClick={(event) => onSelect(event.currentTarget)}
    >
      <span className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">
        {ticket.subject}
      </span>
      <span>
        <span className="mr-2 text-xs text-muted-foreground sm:hidden">
          优先级
        </span>
        <PriorityBadge priority={ticket.priority} />
      </span>
      <span>
        <span className="mr-2 text-xs text-muted-foreground sm:hidden">
          状态
        </span>
        <StatusBadge status={ticket.status} />
      </span>
      <span className="min-w-0 text-sm">
        <span className="mr-2 text-xs text-muted-foreground sm:hidden">
          更新时间
        </span>
        {formatAbsoluteDateTime(ticket.updatedAt)}
      </span>
    </button>
  )
}
