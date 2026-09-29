import { createContext, useContext } from 'react'
import {
  compiledRuntimeSettings,
  type EffectiveRuntimeSettings,
} from './runtime-settings-model'

interface RuntimeSettingsContextValue extends EffectiveRuntimeSettings {
  crispWebsiteId: string | null
}

const RuntimeSettingsContext = createContext<RuntimeSettingsContextValue>({
  brandName: compiledRuntimeSettings.brandName,
  documentTitle: compiledRuntimeSettings.title,
  description: compiledRuntimeSettings.description,
  logoUrl: compiledRuntimeSettings.logoUrl,
  faviconUrl: compiledRuntimeSettings.faviconUrl,
  footerText: compiledRuntimeSettings.footerText,
  crispWebsiteId: null,
})

export const RuntimeSettingsContextProvider = RuntimeSettingsContext.Provider

export function useRuntimeSettings() {
  return useContext(RuntimeSettingsContext)
}
