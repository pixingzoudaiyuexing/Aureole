import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionImportUri,
  getSubscriptionImportTitle,
} from '@/features/subscription/subscription-imports'

const accessUrl = 'https://b.example.com/p/TOKEN?info=hide&client=exact'
const title = 'Aureole 测试'

describe('Subscription client import compatibility', () => {
  it('encodes the exact access URL as one Clash parameter value', () => {
    expect(buildSubscriptionImportUri('clash', accessUrl, title)).toBe(
      `clash://install-config?url=${encodeURIComponent(accessUrl)}&name=${encodeURIComponent(title)}`,
    )
  })

  it('uses UTF-8 Base64 for Shadowrocket', () => {
    const encodedAccessUrl = window.btoa(accessUrl)
    expect(buildSubscriptionImportUri('shadowrocket', accessUrl, title)).toBe(
      `shadowrocket://add/sub://${encodedAccessUrl}?remark=${encodeURIComponent(title)}`,
    )
  })

  it('uses the established Quantumult X remote-resource payload', () => {
    const payload = encodeURIComponent(
      JSON.stringify({ server_remote: [`${accessUrl}, tag=${title}`] }),
    )
    expect(buildSubscriptionImportUri('quantumult-x', accessUrl, title)).toBe(
      `quantumult-x:///update-configuration?remote-resource=${payload}`,
    )
  })

  it('keeps the SingBox URL byte-exact without appending a flag', () => {
    expect(buildSubscriptionImportUri('sing-box', accessUrl, title)).toBe(
      `sing-box://import-remote-profile?url=${encodeURIComponent(accessUrl)}#${encodeURIComponent(title)}`,
    )
  })

  it('round-trips the exact credential through every client encoding', () => {
    const clash = new URL(buildSubscriptionImportUri('clash', accessUrl, title))
    expect(clash.searchParams.get('url')).toBe(accessUrl)

    const shadowrocket = buildSubscriptionImportUri(
      'shadowrocket',
      accessUrl,
      title,
    )
    const encoded = shadowrocket.split('sub://')[1]!.split('?')[0]!
    expect(window.atob(encoded)).toBe(accessUrl)

    const quantumult = new URL(
      buildSubscriptionImportUri('quantumult-x', accessUrl, title),
    )
    const payload = JSON.parse(
      quantumult.searchParams.get('remote-resource')!,
    ) as { server_remote: string[] }
    expect(payload.server_remote).toEqual([`${accessUrl}, tag=${title}`])

    const singBox = new URL(
      buildSubscriptionImportUri('sing-box', accessUrl, title),
    )
    expect(singBox.searchParams.get('url')).toBe(accessUrl)
    expect(singBox.searchParams.get('url')).not.toContain('flag=sing-box')
  })

  it('uses document.title with an Aureole fallback', () => {
    document.title = ' Current Site '
    expect(getSubscriptionImportTitle()).toBe('Current Site')
    document.title = '   '
    expect(getSubscriptionImportTitle()).toBe('Aureole')
  })
})
