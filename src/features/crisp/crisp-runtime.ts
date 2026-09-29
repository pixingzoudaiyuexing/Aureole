export type CrispDataPair = [string, string]

export type CrispCommand =
  | ['set', 'user:email', [string]]
  | ['set', 'session:data', [CrispDataPair[]]]
  | ['do', 'session:reset' | 'chat:hide' | 'chat:show']

declare global {
  interface Window {
    $crisp?: { push: (command: CrispCommand) => unknown }
    CRISP_WEBSITE_ID?: string
  }
}

export const CRISP_SCRIPT_ID = 'aureole-crisp-loader'
export const CRISP_SCRIPT_URL = 'https://client.crisp.chat/l.js'

export function pushCrisp(command: CrispCommand) {
  try {
    window.$crisp?.push(command)
    return Boolean(window.$crisp)
  } catch {
    return false
  }
}

export function resetCrisp() {
  // Drop commands queued before the script loaded so a signed-out profile cannot replay.
  if (Array.isArray(window.$crisp)) window.$crisp.length = 0
  return pushCrisp(['do', 'session:reset'])
}

export function describeClient(userAgent: string) {
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Firefox\//i.test(userAgent)
      ? 'Firefox'
      : /Chrome\//i.test(userAgent)
        ? 'Chrome'
        : /Safari\//i.test(userAgent)
          ? 'Safari'
          : 'Browser'
  const os = /iPhone|iPad|iPod/i.test(userAgent)
    ? 'iOS'
    : /Android/i.test(userAgent)
      ? 'Android'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Other OS'
  const device = /Mobile|iPhone|iPod|Android/i.test(userAgent)
    ? 'Mobile'
    : 'Desktop'
  return `${browser} / ${os} / ${device}`
}
