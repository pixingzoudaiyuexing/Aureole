import { useLayoutEffect } from 'react'
import { useRuntimeSettings } from '@/features/runtime-settings/runtime-settings-context'
import { CRISP_SCRIPT_ID } from './crisp-script'

type CrispDataPair = [string, string]
export type CrispCommand =
  | ['set', 'user:email', [string]]
  | ['set', 'session:data', [CrispDataPair[]]]
  | ['do', 'session:reset']

declare global {
  interface Window {
    $crisp?: CrispCommand[] | { push: (command: CrispCommand) => unknown }
    CRISP_WEBSITE_ID?: string
  }
}

const CRISP_SCRIPT_URL = 'https://client.crisp.chat/l.js'

export function CrispLoader() {
  const websiteId = useRuntimeSettings().crispWebsiteId

  useLayoutEffect(() => {
    if (!websiteId || document.getElementById(CRISP_SCRIPT_ID)) return

    window.$crisp = []
    window.CRISP_WEBSITE_ID = websiteId
    const script = document.createElement('script')
    script.id = CRISP_SCRIPT_ID
    script.src = CRISP_SCRIPT_URL
    script.async = true
    script.dataset.bootWebsiteId = websiteId
    document.head.appendChild(script)
  }, [websiteId])

  return null
}
