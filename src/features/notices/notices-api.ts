import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const idSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .refine((v) => Number(v) <= 2_147_483_647)
const tagsSchema = z.array(z.string().max(255)).max(255)
const summarySchema = z
  .object({
    id: idSchema,
    title: z.string().min(1).max(255),
    tags: tagsSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strip()
const pageSchema = z
  .object({
    items: z.array(summarySchema),
    page: z.number().int().positive().max(2_147_483_647),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strip()
const detailSchema = summarySchema
  .extend({ content: z.string().min(1).max(65_535) })
  .strip()

export type NoticeSummary = z.infer<typeof summarySchema>
export type NoticePage = z.infer<typeof pageSchema>
export type NoticeDetail = z.infer<typeof detailSchema>

function parse<T>(schema: z.ZodType<T>, data: unknown) {
  const result = schema.safeParse(data)
  if (!result.success)
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  return result.data
}

function malformedResponse(): never {
  throw new ApiError({
    status: 200,
    code: 'MALFORMED_RESPONSE',
    message: 'The public API returned an invalid response',
  })
}

export const noticesApi = {
  async getList(accessToken: string, page: number, pageSize: number) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/notices?${query}`,
      { method: 'GET', accessToken },
    )
    const result = parse(pageSchema, data)
    if (result.page !== page || result.pageSize !== pageSize) {
      malformedResponse()
    }
    return result
  },
  async getDetail(accessToken: string, id: string) {
    const validId = idSchema.parse(id)
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/notices/${encodeURIComponent(validId)}`,
      { method: 'GET', accessToken },
    )
    return parse(detailSchema, data)
  },
}
