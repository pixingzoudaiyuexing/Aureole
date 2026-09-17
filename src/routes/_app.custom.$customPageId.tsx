import { createFileRoute } from '@tanstack/react-router'
import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { CustomPageView } from '@/features/custom-pages/custom-page-view'
import { useCustomPages } from '@/features/custom-pages/custom-pages-queries'
import { getIframeCustomPageById } from '@/features/custom-pages/custom-pages-routing'
import { useAuthSessionStore } from '@/lib/auth/session-store'

export const Route = createFileRoute('/_app/custom/$customPageId')({
  component: CustomPageRoute,
})

function CustomPageRoute() {
  const { customPageId } = Route.useParams()
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const customPages = useCustomPages(accessToken)

  if (customPages.isPending) {
    return (
      <section className="flex min-h-0 w-full flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground" role="status">
          正在读取页面…
        </p>
      </section>
    )
  }

  if (customPages.isError) {
    if (isInvalidSessionError(customPages.error)) return null

    return (
      <section className="flex min-h-0 w-full flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <ReadError
          message="暂时无法加载此页面。"
          error={customPages.error}
          retry={() => void customPages.refetch()}
        />
      </section>
    )
  }

  return (
    <CustomPageView
      page={getIframeCustomPageById(customPageId, customPages.data.items)}
    />
  )
}
