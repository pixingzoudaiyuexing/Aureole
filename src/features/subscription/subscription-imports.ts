export type SubscriptionImportClient =
  'clash' | 'shadowrocket' | 'quantumult-x' | 'sing-box'

function toUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

export function getSubscriptionImportTitle() {
  return document.title.trim() || 'Aureole'
}

export function buildSubscriptionImportUri(
  client: SubscriptionImportClient,
  accessUrl: string,
  title = getSubscriptionImportTitle(),
) {
  if (client === 'clash') {
    return `clash://install-config?url=${encodeURIComponent(accessUrl)}&name=${encodeURIComponent(title)}`
  }
  if (client === 'shadowrocket') {
    return `shadowrocket://add/sub://${toUtf8Base64(accessUrl)}?remark=${encodeURIComponent(title)}`
  }
  if (client === 'quantumult-x') {
    return `quantumult-x:///update-configuration?remote-resource=${encodeURIComponent(
      JSON.stringify({ server_remote: [`${accessUrl}, tag=${title}`] }),
    )}`
  }
  return `sing-box://import-remote-profile?url=${encodeURIComponent(accessUrl)}#${encodeURIComponent(title)}`
}

export const subscriptionImportNavigation = {
  goTo(uri: string) {
    window.location.href = uri
  },
}
