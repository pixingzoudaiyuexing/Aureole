import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const safeBytesSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
const trafficEntrySchema = z
  .object({
    uploadedBytes: safeBytesSchema,
    downloadedBytes: safeBytesSchema,
    recordedAt: z.string().datetime({ offset: true }),
    rateMultiplier: z.number().finite().nonnegative(),
  })
  .strip()
const trafficLogsResponseSchema = z
  .object({ entries: z.array(trafficEntrySchema) })
  .strip()

export type TrafficLogEntry = z.infer<typeof trafficEntrySchema>

function parseTrafficLogs(data: unknown) {
  const parsed = trafficLogsResponseSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data.entries
}

export const trafficApi = {
  async getLogs(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/traffic/logs',
      { method: 'GET', accessToken },
    )
    return parseTrafficLogs(data)
  },
}
