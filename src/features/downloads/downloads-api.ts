import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

function hasUnsafeUrlText(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f || /\s/u.test(character)
  })
}

const downloadUrlSchema = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    if (hasUnsafeUrlText(value)) {
      context.addIssue({ code: 'custom', message: 'Download URL is unsafe' })
      return
    }

    try {
      const url = new URL(value)
      if (url.protocol !== 'https:' || url.username || url.password) {
        context.addIssue({ code: 'custom', message: 'Download URL is unsafe' })
      }
    } catch {
      context.addIssue({ code: 'custom', message: 'Download URL is invalid' })
    }
  })

const downloadOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: downloadUrlSchema,
  })
  .strip()

const downloadItemSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    platform: z.enum(['windows', 'macos', 'android', 'linux']),
    arch: z.string().min(1).nullable(),
    version: z.string().min(1),
    publishedAt: z.string().min(1).nullable(),
    filename: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    downloads: z.tuple([downloadOptionSchema, downloadOptionSchema]),
  })
  .strip()

const downloadsSchema = z.object({ items: z.array(downloadItemSchema) }).strip()

export type DownloadItem = z.infer<typeof downloadItemSchema>
export type DownloadsData = z.infer<typeof downloadsSchema>

function parseDownloads(data: unknown) {
  const result = downloadsSchema.safeParse(data)
  if (!result.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return result.data
}

export const downloadsApi = {
  async getDownloads() {
    const data = await apiClient.request<unknown>('/api/v1/downloads', {
      method: 'GET',
    })
    return parseDownloads(data)
  },
}
