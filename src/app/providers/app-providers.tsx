import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import type { AppRouter } from '@/app/router/router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/auth-provider'
import type { AuthApi } from '@/features/auth/auth-api'
import { CrispLoader } from '@/features/crisp/crisp-loader'
import { CrispMetadata } from '@/features/crisp/crisp-metadata'
import { RuntimeSettingsProvider } from '@/features/runtime-settings/runtime-settings-provider'
import { createQueryClient } from './query-client'
import { ThemeProvider } from './theme-provider'

export function AppProviders({
  router,
  authApi,
  queryClient: providedQueryClient,
}: {
  router: AppRouter
  authApi?: AuthApi
  queryClient?: QueryClient
}) {
  const [internalQueryClient] = useState(createQueryClient)
  const queryClient = providedQueryClient ?? internalQueryClient

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RuntimeSettingsProvider>
          <CrispLoader />
          <AuthProvider api={authApi}>
            <CrispMetadata />
            <TooltipProvider delayDuration={250}>
              <RouterProvider router={router} />
            </TooltipProvider>
          </AuthProvider>
        </RuntimeSettingsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
