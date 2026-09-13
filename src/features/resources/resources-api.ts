import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const resourceSchema = z
  .object({
    id: z.string().regex(/^[1-9]\d*$/),
    name: z.string().min(1),
    category: z.string().min(1),
    status: z.enum(['online', 'offline']),
  })
  .strip()
const resourcesResponseSchema = z
  .object({ resources: z.array(resourceSchema) })
  .strip()

export type PublicResource = z.infer<typeof resourceSchema>

function parseResources(data: unknown) {
  const parsed = resourcesResponseSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data.resources
}

export const resourcesApi = {
  async getResources(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/resources',
      { method: 'GET', accessToken },
    )
    return parseResources(data)
  },
}
