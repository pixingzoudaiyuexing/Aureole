type CrispSdk = (typeof import('crisp-sdk-web'))['Crisp']

let sdk: CrispSdk | null = null
let loadedWebsiteId: string | null = null
let desiredWebsiteId: string | null = null
let loadPromise: Promise<void> | null = null
let safeToShow = false
let isolationPending = false
let activated = false
let identityReady = false
let recheckIdentity: (() => void) | null = null
let blockedWebsiteId: string | null = null
let activationSequence = 0
let activationBlocked = false
let failedImportSequence: number | null = null

export function setSupportWidgetIdentityReady(ready: boolean) {
  if (ready === identityReady) return
  identityReady = ready
  if (!ready) {
    isolateSupportWidgetSession()
  } else {
    recheckIdentity?.()
  }
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

function hideAndReset() {
  if (!sdk || !loadedWebsiteId) return
  try {
    sdk.chat.hide()
    sdk.chat.close()
    sdk.session.reset()
    isolationPending = false
  } catch {
    // Keep the widget disabled if the third-party runtime is unavailable.
  }
}

export function isolateSupportWidgetSession() {
  ++activationSequence
  safeToShow = false
  isolationPending = true
  activated = false
  hideAndReset()
}

export function disableSupportWidget() {
  ++activationSequence
  safeToShow = false
  desiredWebsiteId = null
  activated = false
  if (sdk && loadedWebsiteId) {
    try {
      sdk.chat.hide()
      sdk.chat.close()
    } catch {
      // A broken third-party runtime must not interrupt auth transitions.
    }
  }
}

export function rejectSupportWidgetConfig() {
  if (loadedWebsiteId) {
    blockedWebsiteId = loadedWebsiteId
    hideAndReset()
  }
  disableSupportWidget()
}

export function enableSupportWidget(websiteId: string) {
  if (!identityReady) {
    disableSupportWidget()
    return
  }
  if (blockedWebsiteId === websiteId || activationBlocked) return
  desiredWebsiteId = websiteId
  safeToShow = true

  if (sdk && loadedWebsiteId === websiteId) {
    if (isolationPending) hideAndReset()
    if (!activated) {
      sdk.chat.show()
      activated = true
    }
    return
  }

  // The SDK cannot unload its script or swap a configured website in one page.
  if (loadedWebsiteId && loadedWebsiteId !== websiteId) {
    blockedWebsiteId = websiteId
    hideAndReset()
    return
  }

  if (!loadPromise) {
    const sequence = activationSequence
    loadPromise = import('crisp-sdk-web')
      .then(({ Crisp }) => {
        sdk = Crisp
        if (
          !identityReady ||
          !safeToShow ||
          sequence !== activationSequence ||
          !desiredWebsiteId ||
          loadedWebsiteId
        )
          return
        Crisp.configure(desiredWebsiteId, { autoload: false })
        Crisp.chat.hide()
        Crisp.load()
        loadedWebsiteId = desiredWebsiteId
        isolationPending = false
      })
      .then(() => {
        if (
          identityReady &&
          safeToShow &&
          sequence === activationSequence &&
          desiredWebsiteId === loadedWebsiteId &&
          !activated
        ) {
          sdk?.chat.show()
          activated = true
        }
      })
      .catch(() => {
        activationBlocked = true
        failedImportSequence = sequence
        disableSupportWidget()
      })
      .finally(() => {
        loadPromise = null
        if (
          identityReady &&
          safeToShow &&
          desiredWebsiteId &&
          !loadedWebsiteId &&
          sequence !== activationSequence &&
          failedImportSequence !== sequence
        ) {
          enableSupportWidget(desiredWebsiteId)
        }
      })
  }
}
