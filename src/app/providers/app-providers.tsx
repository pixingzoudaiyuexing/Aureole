import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import type { AppRouter } from '@/app/router/router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from './query-client'
import { ThemeProvider } from './theme-provider'

export function AppProviders({ router }: { router: AppRouter }) {
  const [queryClient] = useState(createQueryClient)

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
