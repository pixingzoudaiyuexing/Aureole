import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createQueryClient } from '@/app/providers/query-client'
import { RuntimeSettingsContextProvider } from './runtime-settings-context'
import {
  compiledRuntimeSettings,
  getEffectiveRuntimeSettings,
  type EffectiveRuntimeSettings,
} from './runtime-settings-model'
import type { RuntimeSettings } from './runtime-settings-api'
import { useRuntimeSettingsQuery } from './runtime-settings-queries'

const runtimeFaviconSelector = 'link[data-runtime-settings-favicon="true"]'

function applyRuntimeFavicon(url: string | null) {
  const existing = document.head.querySelector<HTMLLinkElement>(
    runtimeFaviconSelector,
  )

  if (!url) {
    existing?.remove()
    return
  }

  const favicon = existing ?? document.createElement('link')
  favicon.rel = 'icon'
  favicon.href = url
  favicon.referrerPolicy = 'no-referrer'
  favicon.setAttribute('referrerpolicy', 'no-referrer')
  favicon.setAttribute('data-runtime-settings-favicon', 'true')

  if (!existing) document.head.append(favicon)
}

function RuntimeSettingsDocumentEffects({
  settings,
  runtimeSettings,
}: {
  settings: EffectiveRuntimeSettings
  runtimeSettings: RuntimeSettings | null
}) {
  useEffect(() => {
    const runtimeDocumentTitle =
      runtimeSettings?.title ?? runtimeSettings?.siteName
    const runtimeDescription = runtimeSettings?.description

    if (runtimeDocumentTitle !== null && runtimeDocumentTitle !== undefined) {
      document.title = settings.documentTitle
    }
    if (runtimeDescription !== null && runtimeDescription !== undefined) {
      document.head
        .querySelector<HTMLMetaElement>('meta[name="description"]')
        ?.setAttribute('content', settings.description)
    }
    applyRuntimeFavicon(settings.faviconUrl)

    return () => {
      if (runtimeDocumentTitle !== null && runtimeDocumentTitle !== undefined) {
        document.title = compiledRuntimeSettings.title
      }
      if (runtimeDescription !== null && runtimeDescription !== undefined) {
        document.head
          .querySelector<HTMLMetaElement>('meta[name="description"]')
          ?.setAttribute('content', compiledRuntimeSettings.description)
      }
      document.head.querySelector(runtimeFaviconSelector)?.remove()
    }
  }, [runtimeSettings, settings])

  return null
}

export function RuntimeSettingsProvider({
  children,
  queryClient: providedQueryClient,
}: {
  children: ReactNode
  queryClient?: QueryClient
}) {
  // Public configuration survives AuthProvider clearing its private query cache.
  const [publicQueryClient] = useState(createQueryClient)
  const runtimeSettingsQuery = useRuntimeSettingsQuery(
    providedQueryClient ?? publicQueryClient,
  )
  const settings = runtimeSettingsQuery.isSuccess
    ? runtimeSettingsQuery.data
    : null
  const effectiveSettings = useMemo(
    () => getEffectiveRuntimeSettings(settings),
    [settings],
  )

  return (
    <RuntimeSettingsContextProvider
      value={{
        ...effectiveSettings,
        crispWebsiteId: settings?.crispWebsiteId ?? null,
      }}
    >
      <RuntimeSettingsDocumentEffects
        settings={effectiveSettings}
        runtimeSettings={settings}
      />
      {children}
    </RuntimeSettingsContextProvider>
  )
}
