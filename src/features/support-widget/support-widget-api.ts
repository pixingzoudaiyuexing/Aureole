import { z } from 'zod'
import { apiClient } from '@/lib/api/client'

const websiteId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

const supportWidgetConfig = z
  .object({
    crisp: z.discriminatedUnion('enabled', [
      z.object({ enabled: z.literal(false) }).strict(),
      z.object({ enabled: z.literal(true), websiteId }).strict(),
    ]),
  })
  .strict()

const responseSchema = z
  .object({
    ok: z.literal(true),
    data: supportWidgetConfig,
    requestId: z.string(),
  })
  .strict()

export type SupportWidgetConfig = z.infer<typeof supportWidgetConfig>

export const supportWidgetApi = {
  getConfig: () =>
    apiClient.strictPublicRequest('/api/v1/config/support-widget', {
      parse: (payload) => responseSchema.parse(payload).data,
    }),
}
