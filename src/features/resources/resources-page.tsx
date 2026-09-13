import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { useResources } from './resources-queries'

export function ResourcesPage() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <ResourcesContent accessToken={accessToken} />
}

function ResourcesContent({ accessToken }: { accessToken: string }) {
  const resources = useResources(accessToken)
  useExitOnInvalidSessionError(resources.error)

  if (isInvalidSessionError(resources.error)) return null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <p className="text-xs font-semibold uppercase text-primary">服务资源</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">资源</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          查看当前账户可见资源的类型与在线状态。
        </p>
      </div>

      <section
        className="border-t border-border py-8"
        aria-labelledby="resources-list-title"
      >
        <div className="mb-6">
          <h3 id="resources-list-title" className="text-base font-semibold">
            资源列表
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            状态和类型来自当前账户的资源目录。
          </p>
        </div>

        {resources.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在读取资源…
          </p>
        ) : resources.isError ? (
          <ReadError
            message="暂时无法读取资源。"
            error={resources.error}
            retry={() => void resources.refetch()}
          />
        ) : resources.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            当前没有可展示的资源。
          </p>
        ) : (
          <div className="border-y border-border">
            <div
              className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,0.45fr)_8rem] gap-6 border-b border-border py-3 text-xs font-medium text-muted-foreground sm:grid"
              aria-hidden="true"
            >
              <span>名称</span>
              <span>类型</span>
              <span>状态</span>
            </div>
            <ul className="divide-y divide-border">
              {resources.data.map((resource) => (
                <li
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.45fr)_8rem] sm:items-center sm:gap-6"
                  key={resource.id}
                >
                  <p className="break-words text-sm font-medium">
                    {resource.name}
                  </p>
                  <p className="break-words text-sm">
                    <span className="mr-2 text-xs text-muted-foreground sm:hidden">
                      类型
                    </span>
                    {resource.category}
                  </p>
                  <p className="text-sm">
                    <span className="mr-2 text-xs text-muted-foreground sm:hidden">
                      状态
                    </span>
                    <span
                      className={
                        resource.status === 'online'
                          ? 'inline-flex rounded-sm border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary'
                          : 'inline-flex rounded-sm border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {resource.status === 'online' ? '在线' : '离线'}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
