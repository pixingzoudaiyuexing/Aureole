import type { RuntimeSettings } from './runtime-settings-api'

export const compiledRuntimeSettings = {
  siteName: 'Aureole',
  brandName: 'Aureole',
  title: 'Aureole',
  description: 'Aureole account and subscription management',
  logoUrl: null,
  faviconUrl: null,
  footerText: 'Aureole',
} as const

export interface EffectiveRuntimeSettings {
  brandName: string
  documentTitle: string
  description: string
  logoUrl: string | null
  faviconUrl: string | null
  footerText: string
}

export function getEffectiveRuntimeSettings(
  settings: RuntimeSettings | null,
): EffectiveRuntimeSettings {
  const siteName = settings?.siteName ?? compiledRuntimeSettings.siteName

  return {
    brandName:
      settings?.brandName ?? siteName ?? compiledRuntimeSettings.brandName,
    documentTitle: settings?.title ?? siteName ?? compiledRuntimeSettings.title,
    description: settings?.description ?? compiledRuntimeSettings.description,
    logoUrl: settings?.logoUrl ?? compiledRuntimeSettings.logoUrl,
    faviconUrl: settings?.faviconUrl ?? compiledRuntimeSettings.faviconUrl,
    footerText:
      settings?.footerText ?? siteName ?? compiledRuntimeSettings.footerText,
  }
}
