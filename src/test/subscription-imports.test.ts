import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionImportUri,
  getSubscriptionImportTitle,
  type SubscriptionImportClient,
} from '@/features/subscription/subscription-imports'

const accessUrl = 'https://b.example.com/p/TOKEN?info=hide&client=exact'
const defaultAccessUrl = 'https://sub.example/TOKEN'
const hiddenInfoAccessUrl = 'https://sub.example/TOKEN?info=hide'
const title = 'Aureole 测试'

function decodeUtf8Base64(value: string) {
  const binary = window.atob(value)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function extractSubscriptionUrl(
  client: SubscriptionImportClient,
  importUri: string,
) {
  if (client === 'clash') {
    const parsed = new URL(importUri)
    return {
      accessUrl: parsed.searchParams.get('url'),
      outerInfo: parsed.searchParams.get('info'),
    }
  }

  if (client === 'shadowrocket') {
    const encoded = importUri.split('sub://')[1]?.split('?')[0]
    if (!encoded) throw new Error('Shadowrocket payload missing')
    return { accessUrl: decodeUtf8Base64(encoded), outerInfo: null }
  }

  if (client === 'quantumult-x') {
    const parsed = new URL(importUri)
    const encodedPayload = parsed.searchParams.get('remote-resource')
    if (!encodedPayload) throw new Error('Quantumult X payload missing')
    const payload = JSON.parse(encodedPayload) as { server_remote: string[] }
    const [remote] = payload.server_remote
    const tagSuffix = `, tag=${title}`
    if (!remote?.endsWith(tagSuffix)) {
      throw new Error('Quantumult X tag metadata missing')
    }
    return {
      accessUrl: remote.slice(0, -tagSuffix.length),
      outerInfo: parsed.searchParams.get('info'),
    }
  }

  const parsed = new URL(importUri)
  return {
    accessUrl: parsed.searchParams.get('url'),
    outerInfo: parsed.searchParams.get('info'),
  }
}

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

  it('round-trips a genuinely UTF-8 Shadowrocket subscription URL', () => {
    const unicodeAccessUrl = 'https://sub.example/订阅?token=长期令牌'
    const importUri = buildSubscriptionImportUri(
      'shadowrocket',
      unicodeAccessUrl,
      title,
    )
    const encoded = importUri.split('sub://')[1]?.split('?')[0]

    expect(encoded).toBeDefined()
    expect(decodeUtf8Base64(encoded!)).toBe(unicodeAccessUrl)
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

  describe.each([
    ['Clash', 'clash'],
    ['Shadowrocket', 'shadowrocket'],
    ['Quantumult X', 'quantumult-x'],
    ['Sing-box', 'sing-box'],
  ] as const)('%s canonical access URL matrix', (_label, client) => {
    it.each([
      ['default', defaultAccessUrl],
      ['info=hide', hiddenInfoAccessUrl],
    ] as const)('preserves the %s URL byte-for-byte', (_variant, original) => {
      const importUri = buildSubscriptionImportUri(client, original, title)
      const decoded = extractSubscriptionUrl(client, importUri)

      expect(decoded.accessUrl).toBe(original)

      if (client === 'clash') {
        expect(decoded.outerInfo).toBeNull()
      }
      if (client === 'sing-box') {
        expect(decoded.accessUrl).not.toContain('flag=sing-box')
        expect(decoded.outerInfo).toBeNull()
      }
    })
  })

  it('uses document.title with an Aureole fallback', () => {
    document.title = ' Current Site '
    expect(getSubscriptionImportTitle()).toBe('Current Site')
    document.title = '   '
    expect(getSubscriptionImportTitle()).toBe('Aureole')
  })
})
