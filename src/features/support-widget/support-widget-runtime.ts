const CRISP_SCRIPT_URL = 'https://client.crisp.chat/l.js'

type CrispCommand = [string, string, ...unknown[]]

declare global {
  interface Window {
    $crisp?: CrispCommand[]
    CRISP_WEBSITE_ID?: string
  }
}

let loadedWebsiteId: string | null = null
let identityReady = false
let recheckIdentity: (() => void) | null = null
let blocked = false

function command(name: string) {
  window.$crisp?.push(['do', name])
}

export function setSupportWidgetIdentityReady(ready: boolean) {
  if (ready === identityReady) return
  identityReady = ready
  if (!ready) isolateSupportWidgetSession()
  else recheckIdentity?.()
}

export function isSupportWidgetIdentityReady() {
  return identityReady
}

export function subscribeSupportWidgetIdentityRecheck(callback: () => void) {
  recheckIdentity = callback
  return () => {
    if (recheckIdentity === callback) recheckIdentity = null
  }
}

export function isolateSupportWidgetSession() {
  if (!loadedWebsiteId) return
  command('chat:hide')
  command('chat:close')
  command('session:reset')
}

export function disableSupportWidget() {
  if (!loadedWebsiteId) return
  command('chat:hide')
  command('chat:close')
}

export function rejectSupportWidgetConfig() {
  if (loadedWebsiteId) {
    isolateSupportWidgetSession()
    blocked = true
  }
  disableSupportWidget()
}

export function enableSupportWidget(websiteId: string) {
  if (!identityReady || blocked) return
  if (loadedWebsiteId && loadedWebsiteId !== websiteId) {
    rejectSupportWidgetConfig()
    return
  }
  if (!loadedWebsiteId) {
    loadedWebsiteId = websiteId
    window.$crisp = window.$crisp || []
    window.CRISP_WEBSITE_ID = websiteId
    const existingScript = Array.from(document.scripts).find(
      (script) => script.src === CRISP_SCRIPT_URL,
    )
    if (!existingScript) {
      const script = document.createElement('script')
      script.src = CRISP_SCRIPT_URL
      script.async = true
      script.onerror = () => {
        blocked = true
        disableSupportWidget()
      }
      document.head.appendChild(script)
    }
  }
  command('chat:show')
}
