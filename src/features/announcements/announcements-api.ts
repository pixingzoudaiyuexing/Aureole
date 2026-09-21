import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const announcementSchema = z
  .object({
    id: z.string().min(1).max(255),
    title: z.string().min(1).max(255),
    body: z.string().max(65_535),
  })
  .strip()

const announcementsSchema = z
  .object({ items: z.array(announcementSchema) })
  .strip()

export type Announcement = z.infer<typeof announcementSchema>
export type Announcements = z.infer<typeof announcementsSchema>

function parseAnnouncements(data: unknown) {
  const result = announcementsSchema.safeParse(data)
  if (!result.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return result.data
}

export const announcementsApi = {
  async getAnnouncements(accessToken?: string | null) {
    const data = accessToken
      ? await apiClient.authenticatedRequest<unknown>('/api/v1/announcements', {
          method: 'GET',
          accessToken,
        })
      : await apiClient.request<unknown>('/api/v1/announcements', {
          method: 'GET',
        })

    return parseAnnouncements(data)
  },
}
