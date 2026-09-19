export const SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY =
  'aureole.subscription.selected-entry'

const subscriptionEntryIdPattern = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/

export function readSelectedSubscriptionEntry() {
  try {
    const value = window.sessionStorage.getItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
    )
    if (value && subscriptionEntryIdPattern.test(value)) return value
    if (value !== null) clearSelectedSubscriptionEntry()
    return null
  } catch {
    return null
  }
}

export function writeSelectedSubscriptionEntry(entryId: string) {
  if (!subscriptionEntryIdPattern.test(entryId)) return
  try {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      entryId,
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
