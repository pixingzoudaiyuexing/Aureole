import { createContext, useContext } from 'react'
import {
  compiledRuntimeSettings,
  type EffectiveRuntimeSettings,
} from './runtime-settings-model'

const RuntimeSettingsContext = createContext<EffectiveRuntimeSettings>({
  brandName: compiledRuntimeSettings.brandName,
  documentTitle: compiledRuntimeSettings.title,
  description: compiledRuntimeSettings.description,
  logoUrl: compiledRuntimeSettings.logoUrl,
  faviconUrl: compiledRuntimeSettings.faviconUrl,
  footerText: compiledRuntimeSettings.footerText,
})

export const RuntimeSettingsContextProvider = RuntimeSettingsContext.Provider

export function useRuntimeSettings() {
  return useContext(RuntimeSettingsContext)
}
