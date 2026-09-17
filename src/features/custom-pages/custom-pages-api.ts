import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const customPageIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const customPageTitleSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value.trim() === value)

export const customPageUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (
      value.length === 0 ||
      value.trim() !== value ||
      [...value].some((character) => character.charCodeAt(0) <= 0x20)
    ) {
      return false
    }
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        url.hostname.length > 0 &&
        !url.username &&
        !url.password
      )
    } catch {
      return false
    }
  })

const customPageSchema = z
  .object({
    id: customPageIdSchema,
    title: customPageTitleSchema,
    url: customPageUrlSchema,
    mode: z.enum(['iframe', 'external']),
  })
  .strip()

const customPagesSchema = z
  .object({ items: z.array(customPageSchema) })
  .strip()
  .superRefine((value, context) => {
    const ids = new Set<string>()
    value.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate Custom Page ID',
          path: ['items', index, 'id'],
        })
      }
      ids.add(item.id)
    })
  })

export type CustomPage = z.infer<typeof customPageSchema>
export type CustomPages = z.infer<typeof customPagesSchema>

function parseCustomPages(data: unknown) {
  const parsed = customPagesSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data
}

export const customPagesApi = {
  async getList(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/custom-pages',
      { method: 'GET', accessToken },
    )
    return parseCustomPages(data)
  },
}
