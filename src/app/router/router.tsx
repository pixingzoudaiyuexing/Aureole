import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'

export function createAppRouter(options?: { initialEntries?: string[] }) {
  return createRouter({
    routeTree,
    context: {},
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    ...(options?.initialEntries
      ? {
          history: createMemoryHistory({
            initialEntries: options.initialEntries,
          }),
        }
      : {}),
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
