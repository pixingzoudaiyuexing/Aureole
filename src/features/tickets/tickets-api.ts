import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

export const ticketIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .refine((value) => Number(value) <= 2_147_483_647)
export const ticketPriorities = ['low', 'normal', 'high'] as const
export const ticketStatuses = ['open', 'closed'] as const

const timestampSchema = z.string().datetime({ offset: true })
const ticketSummarySchema = z
  .object({
    id: ticketIdSchema,
    subject: z.string().min(1).max(255),
    priority: z.enum(ticketPriorities),
    status: z.enum(ticketStatuses),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strip()
const ticketMessageSchema = z
  .object({
    id: ticketIdSchema,
    content: z.string().min(1).max(65_535),
    fromMe: z.boolean(),
    createdAt: timestampSchema,
  })
  .strip()
const ticketsResponseSchema = z
  .object({ tickets: z.array(ticketSummarySchema) })
  .strip()
const ticketDetailSchema = ticketSummarySchema
  .extend({ messages: z.array(ticketMessageSchema) })
  .strip()

export type TicketPriority = (typeof ticketPriorities)[number]
export type TicketStatus = (typeof ticketStatuses)[number]
export type TicketSummary = z.infer<typeof ticketSummarySchema>
export type TicketMessage = z.infer<typeof ticketMessageSchema>
export type TicketDetail = z.infer<typeof ticketDetailSchema>

function parse<T>(schema: z.ZodType<T>, data: unknown) {
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

export const ticketsApi = {
  async getList(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/tickets',
      { method: 'GET', accessToken },
    )
    return parse(ticketsResponseSchema, data).tickets
  },

  async getDetail(accessToken: string, id: string) {
    const validId = ticketIdSchema.parse(id)
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/tickets/${encodeURIComponent(validId)}`,
      { method: 'GET', accessToken },
    )
    return parse(ticketDetailSchema, data)
  },
}
