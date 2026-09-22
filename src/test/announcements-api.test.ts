import { describe, expect, it, vi } from 'vitest'
import { announcementsApi } from '@/features/announcements/announcements-api'
import { announcementsQueryKeys } from '@/features/announcements/announcements-queries'
import { apiClient } from '@/lib/api/client'

describe('Announcements API', () => {
  it('keeps public and authenticated query namespaces separate', () => {
    expect(announcementsQueryKeys.public).toEqual(['announcements', 'public'])
    expect(announcementsQueryKeys.authenticated).toEqual([
      'announcements',
      'authenticated',
    ])
    expect(JSON.stringify(announcementsQueryKeys)).not.toContain('token')
  })

  it('uses the anonymous request boundary and preserves server order', async () => {
    const authenticatedRequest = vi.spyOn(apiClient, 'authenticatedRequest')
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue({
      items: [
        { id: 'b', title: 'Second', body: 'Body 2', extra: true },
        { id: 'a', title: 'First', body: 'Body 1' },
      ],
    })

    await expect(announcementsApi.getAnnouncements()).resolves.toEqual({
      items: [
        { id: 'b', title: 'Second', body: 'Body 2' },
        { id: 'a', title: 'First', body: 'Body 1' },
      ],
    })
    expect(request).toHaveBeenCalledWith('/api/v1/announcements', {
      method: 'GET',
    })
    expect(authenticatedRequest).not.toHaveBeenCalled()
  })

  it('uses the authenticated request boundary without putting the token in the query', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ items: [] })

    await expect(
      announcementsApi.getAnnouncements('opaque-token'),
    ).resolves.toEqual({
      items: [],
    })
    expect(request).toHaveBeenCalledWith('/api/v1/announcements', {
      method: 'GET',
      accessToken: 'opaque-token',
    })
  })

  it.each([
    {},
    { items: [{ id: '1', title: 'Title' }] },
    { items: [{ id: '1', title: 'Title', body: 42 }] },
  ])('rejects malformed payloads as MALFORMED_RESPONSE', async (payload) => {
    vi.spyOn(apiClient, 'request').mockResolvedValue(payload)

    await expect(announcementsApi.getAnnouncements()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })
})
