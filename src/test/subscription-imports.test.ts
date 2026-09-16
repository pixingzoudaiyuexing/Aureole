import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionImportUri,
  getSubscriptionImportTitle,
} from '@/features/subscription/subscription-imports'

const accessUrl =
  'https://b.example.com/p/api/v1/client/subscribe?token=dummy-token'
const title = 'Aureole 测试'

describe('Subscription client import compatibility', () => {
  it('uses the established Clash URI without adding a flag', () => {
    expect(buildSubscriptionImportUri('clash', accessUrl, title)).toBe(
      `clash://install-config?url=${accessUrl}&name=${encodeURIComponent(title)}`,
    )
  })

  it('uses UTF-8 Base64 for Shadowrocket', () => {
    const encodedAccessUrl = window.btoa(accessUrl)
    expect(buildSubscriptionImportUri('shadowrocket', accessUrl, title)).toBe(
      `shadowrocket://add/sub://${encodedAccessUrl}?remark=${encodeURIComponent(title)}`,
    )
  })

  it('uses the established Quantumult X remote-resource payload', () => {
    const payload = encodeURI(
      JSON.stringify({ server_remote: [`${accessUrl}, tag=${title}`] }),
    )
    expect(buildSubscriptionImportUri('quantumult-x', accessUrl, title)).toBe(
      `quantumult-x:///update-configuration?remote-resource=${payload}`,
    )
  })

  it('uses the established SingBox flag and fragment title', () => {
    expect(buildSubscriptionImportUri('sing-box', accessUrl, title)).toBe(
      `sing-box://import-remote-profile?url=${encodeURIComponent(
        `${accessUrl}&flag=sing-box`,
      )}#${encodeURIComponent(title)}`,
    )
  })

  it('uses document.title with an Aureole fallback', () => {
    document.title = ' Current Site '
    expect(getSubscriptionImportTitle()).toBe('Current Site')
    document.title = '   '
    expect(getSubscriptionImportTitle()).toBe('Aureole')
  })
})
