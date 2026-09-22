import { ReadError } from '@/components/shared/read-error'
import { useAuth } from '@/features/auth/auth-context'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useAnnouncements } from './announcements-queries'

export function AnnouncementsSurface() {
  const { status } = useAuth()
  const query = useAnnouncements()
  const invalidSessionError =
    status === 'authenticated' && isInvalidSessionError(query.error)
      ? query.error
      : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (query.isPending || (query.isFetching && !query.data)) {
    return (
      <section
        className="border-b border-border px-4 py-3 sm:px-6"
        aria-label="Announcements"
      >
        <p className="text-sm text-muted-foreground" role="status">
          Loading announcements…
        </p>
      </section>
    )
  }

  if (invalidSessionError) return null

  if (query.isError) {
    return (
      <section
        className="border-b border-border px-4 py-3 sm:px-6"
        aria-label="Announcements"
      >
        <ReadError
          message="Unable to read announcements."
          error={query.error}
          retry={() => void query.refetch()}
        />
      </section>
    )
  }

  const items = query.data?.items ?? []
  if (items.length === 0) return null

  return (
    <section
      className="border-b border-border px-4 py-3 sm:px-6"
      aria-label="Announcements"
    >
      <div className="space-y-3">
        {items.map((announcement) => (
          <article key={announcement.id} className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              {announcement.title}
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {announcement.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
