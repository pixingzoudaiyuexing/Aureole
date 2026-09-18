import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

export const runtimeSettingsUrlSchema = z
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

const nullableTextSchema = z.string().nullable()

const runtimeSettingsSchema = z
  .object({
    siteName: nullableTextSchema,
    brandName: nullableTextSchema,
    title: nullableTextSchema,
    description: nullableTextSchema,
    logoUrl: runtimeSettingsUrlSchema.nullable(),
    faviconUrl: runtimeSettingsUrlSchema.nullable(),
    footerText: nullableTextSchema,
  })
  .strip()

export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>

function malformedResponse(): never {
  throw new ApiError({
    status: 200,
    code: 'MALFORMED_RESPONSE',
    message: 'The public API returned an invalid response',
  })
}

export function parseRuntimeSettings(data: unknown): RuntimeSettings {
  const parsed = runtimeSettingsSchema.safeParse(data)
  if (!parsed.success) return malformedResponse()
  return parsed.data
}

export const runtimeSettingsApi = {
  async getRuntimeSettings() {
    const data = await apiClient.request<unknown>('/api/v1/config/runtime', {
      method: 'GET',
    })
    return parseRuntimeSettings(data)
  },
}
