import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const labelSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((label) => label.trim() === label)
  .refine((label) => !/[<>\p{Cc}]/u.test(label))

// Match the stable ID grammar used by the existing Custom Pages client.
const customPageIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const navigationItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('core'),
      targetId: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
      label: labelSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('custom-page'),
      itemId: customPageIdSchema,
      label: labelSchema,
    })
    .strict(),
])

const navigationSchema = z
  .object({ items: z.array(navigationItemSchema) })
  .strict()
  .superRefine((value, context) => {
    const identities = new Set<string>()
    value.items.forEach((item, index) => {
      const identity =
        item.kind === 'core' ? `core:${item.targetId}` : `custom:${item.itemId}`
      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate navigation identity',
          path: ['items', index],
        })
      }
      identities.add(identity)
    })
  })

export type NavigationData = z.infer<typeof navigationSchema>

export const navigationApi = {
  async getList(accessToken: string): Promise<NavigationData> {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/navigation',
      { method: 'GET', accessToken },
    )
    const parsed = navigationSchema.safeParse(data)
    if (!parsed.success) {
      throw new ApiError({
        status: 200,
        code: 'MALFORMED_RESPONSE',
        message: 'The public API returned an invalid response',
      })
    }
    return parsed.data
  },
}
