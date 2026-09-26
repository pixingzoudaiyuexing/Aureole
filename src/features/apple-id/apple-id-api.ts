import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const accountSchema = z
  .object({
    username: z.string().min(1),
    status: z.boolean(),
    lastCheck: z.string(),
    remark: z.string().nullable(),
  })
  .strip()
const listSchema = z.object({ items: z.array(accountSchema) }).strip()
const revealSchema = accountSchema
  .extend({ password: z.string().min(1) })
  .strip()

export type AppleIdAccount = z.infer<typeof accountSchema>
export type AppleIdList = z.infer<typeof listSchema>
export type AppleIdReveal = z.infer<typeof revealSchema>

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return result.data
}

export const appleIdApi = {
  async list(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/apple-ids',
      { method: 'GET', accessToken },
    )
    return parse(listSchema, data)
  },
  async reveal(accessToken: string, username: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/apple-ids/reveal',
      { method: 'POST', accessToken, body: { username } },
    )
    const revealed = parse(revealSchema, data)
    if (revealed.username !== username) {
      throw new ApiError({
        status: 200,
        code: 'MALFORMED_RESPONSE',
        message: 'The public API returned an invalid response',
      })
    }
    return revealed
  },
}
