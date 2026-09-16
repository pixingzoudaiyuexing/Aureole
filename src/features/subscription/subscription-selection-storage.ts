export const SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY =
  'aureole.subscription.selected-entry'

export function readSelectedSubscriptionEntry() {
  try {
    const value = window.sessionStorage.getItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
    )
    return value && value.length <= 2048 && value.trim().length > 0
      ? value
      : null
  } catch {
    return null
  }
}

export function writeSelectedSubscriptionEntry(baseUrl: string) {
  try {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      baseUrl,
    )
  } catch {
    // Selection persistence is optional; the current document still works.
  }
}

export function clearSelectedSubscriptionEntry() {
  try {
    window.sessionStorage.removeItem(SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY)
  } catch {
    // Storage failures must not break Subscription UI recovery.
  }
}
