import { describe, expect, it, vi } from 'vitest'
import { ticketsApi } from '@/features/tickets/tickets-api'
import {
  ticketCloseMutationOptions,
  ticketCreateMutationOptions,
  ticketReplyMutationOptions,
  ticketsMutationKeys,
} from '@/features/tickets/tickets-queries'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const token = 'opaque-token'
const summary = {
  id: '7',
  subject: 'Connection issue',
  priority: 'normal' as const,
  status: 'open' as const,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
}

const detail = {
  ...summary,
  messages: [
    {
      id: '11',
      content: 'First message',
      fromMe: true,
      createdAt: '2026-09-13T00:10:00.000Z',
    },
    {
      id: '12',
      content: 'Second message',
      fromMe: false,
      createdAt: '2026-09-13T00:20:00.000Z',
    },
  ],
}

describe('Tickets API', () => {
  it('requests the exact list path, preserves server order, and strips private fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        tickets: [
          {
            ...summary,
            level: 1,
            user_id: 99,
            rawStatus: 0,
          },
          {
            ...summary,
            id: '8',
            subject: 'Second ticket',
            priority: 'high',
            status: 'closed',
          },
        ],
        internal: true,
      })

    await expect(ticketsApi.getList(token)).resolves.toEqual([
      summary,
      {
        ...summary,
        id: '8',
        subject: 'Second ticket',
        priority: 'high',
        status: 'closed',
      },
    ])
    expect(request).toHaveBeenCalledWith('/api/v1/tickets', {
      method: 'GET',
      accessToken: token,
    })
  })

  it('accepts an empty list and every public priority/status', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    request.mockResolvedValueOnce({ tickets: [] })
    await expect(ticketsApi.getList(token)).resolves.toEqual([])

    request.mockResolvedValueOnce({
      tickets: [
        { ...summary, priority: 'low', status: 'open' },
        { ...summary, id: '8', priority: 'normal', status: 'closed' },
        { ...summary, id: '9', priority: 'high', status: 'open' },
      ],
    })
    await expect(ticketsApi.getList(token)).resolves.toHaveLength(3)
  })

  it.each([
    { ...summary, id: '0' },
    { ...summary, id: '2147483648' },
    { ...summary, subject: '' },
    { ...summary, priority: 'urgent' },
    { ...summary, status: 'pending' },
    { ...summary, createdAt: 'not-a-date' },
    { ...summary, updatedAt: '2026-09-13' },
  ])('rejects malformed ticket summaries', async (ticket) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      tickets: [ticket],
    })
    await expect(ticketsApi.getList(token)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('requests exact detail, preserves message order, and strips private fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        ...detail,
        staffName: 'private-agent',
        user_id: 99,
        messages: detail.messages.map((message) => ({
          ...message,
          ticket_id: 7,
          admin_id: 3,
          email: 'private@example.com',
        })),
      })

    await expect(ticketsApi.getDetail(token, '7')).resolves.toEqual(detail)
    expect(request).toHaveBeenCalledWith('/api/v1/tickets/7', {
      method: 'GET',
      accessToken: token,
    })
  })

  it.each([
    { ...detail.messages[0], id: undefined },
    { ...detail.messages[0], content: undefined },
    { ...detail.messages[0], fromMe: 'true' },
    { ...detail.messages[0], createdAt: 'bad' },
  ])('rejects malformed ticket messages', async (message) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      ...detail,
      messages: [message],
    })
    await expect(ticketsApi.getDetail(token, '7')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each(['0', '-1', '1.5', '1e3', '01', 'ticket-7', '2147483648'])(
    'rejects invalid local detail id %s before requesting',
    async (id) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(ticketsApi.getDetail(token, id)).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['x', 'low', 'm'],
    ['s'.repeat(255), 'normal', 'm'.repeat(10_000)],
    [
      '  <img src=x onerror=alert(1)>  ',
      'high',
      ' first line\n<script>alert(1)</script> ',
    ],
  ] as const)(
    'posts exact raw Create Ticket input with %s priority',
    async (subject, priority, message) => {
      const request = vi
        .spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValue({ created: true, private: 'strip-me' })

      await expect(
        ticketsApi.create(token, { subject, priority, message }),
      ).resolves.toEqual({ created: true })
      expect(request).toHaveBeenCalledWith('/api/v1/tickets', {
        method: 'POST',
        body: { subject, priority, message },
        accessToken: token,
      })
    },
  )

  it.each([
    { subject: '', priority: 'normal', message: 'm' },
    { subject: 's'.repeat(256), priority: 'normal', message: 'm' },
    { subject: 's', priority: 'normal', message: '' },
    { subject: 's', priority: 'normal', message: 'm'.repeat(10_001) },
    { subject: 's', priority: 'urgent', message: 'm' },
    { subject: 's', priority: '普通', message: 'm' },
    { subject: 's', priority: 'normal', message: 'm', level: 1 },
    { subject: 's', priority: 'normal', message: 'm', status: 'open' },
    { subject: 's', priority: 'normal', message: 'm', id: '7' },
    { subject: 's', priority: 'normal', message: 'm', email: 'x@example.com' },
  ])(
    'rejects invalid or expanded Create Ticket input %# before POST',
    async (input) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')

      await expect(
        ticketsApi.create(token, input as never),
      ).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([{ created: false }, {}, { created: 'true' }, { created: 1 }])(
    'rejects malformed Create Ticket success %#',
    async (payload) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

      await expect(
        ticketsApi.create(token, {
          subject: 'subject',
          priority: 'normal',
          message: 'message',
        }),
      ).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>)
    },
  )

  it.each(['x', 'm'.repeat(10_000), ' first line\n<script>alert(1)</script> '])(
    'posts exact raw Reply Ticket input',
    async (message) => {
      const request = vi
        .spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValue({ replied: true, private: 'strip-me' })

      await expect(ticketsApi.reply(token, '7', { message })).resolves.toEqual({
        replied: true,
      })
      expect(request).toHaveBeenCalledWith('/api/v1/tickets/7/reply', {
        method: 'POST',
        body: { message },
        accessToken: token,
      })
    },
  )

  it.each(['', 'm'.repeat(10_001)])(
    'rejects invalid Reply Ticket message before POST',
    async (message) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(
        ticketsApi.reply(token, '7', { message }),
      ).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('rejects expanded Reply Ticket input before POST', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    await expect(
      ticketsApi.reply(token, '7', {
        message: 'reply',
        status: 'open',
      } as never),
    ).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })

  it.each(['0', '-1', '1.5', '01', '2147483648'])(
    'rejects invalid local Reply and Close id %s before POST',
    async (id) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(
        ticketsApi.reply(token, id, { message: 'reply' }),
      ).rejects.toBeDefined()
      await expect(ticketsApi.close(token, id)).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([{ replied: false }, {}, { replied: 'true' }, { replied: 1 }])(
    'rejects malformed Reply Ticket success %#',
    async (payload) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
      await expect(
        ticketsApi.reply(token, '7', { message: 'reply' }),
      ).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>)
    },
  )

  it('posts Close Ticket without a business body and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ closed: true, private: 'strip-me' })

    await expect(ticketsApi.close(token, '7')).resolves.toEqual({
      closed: true,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/tickets/7/close', {
      method: 'POST',
      accessToken: token,
    })
  })

  it.each([{ closed: false }, {}, { closed: 'true' }, { closed: 1 }])(
    'rejects malformed Close Ticket success %#',
    async (payload) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
      await expect(ticketsApi.close(token, '7')).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>)
    },
  )

  it('uses a credential- and content-free non-retrying mutation key', () => {
    const createOptions = ticketCreateMutationOptions(token)
    const replyOptions = ticketReplyMutationOptions(token)
    const closeOptions = ticketCloseMutationOptions(token)
    expect(ticketsMutationKeys.create).toEqual(['tickets', 'create'])
    expect(ticketsMutationKeys.reply).toEqual(['tickets', 'reply'])
    expect(ticketsMutationKeys.close).toEqual(['tickets', 'close'])
    for (const options of [createOptions, replyOptions, closeOptions]) {
      expect(options.mutationKey).not.toContain(token)
      expect(JSON.stringify(options.mutationKey)).not.toContain('subject')
      expect(JSON.stringify(options.mutationKey)).not.toContain('message')
      expect(JSON.stringify(options.mutationKey)).not.toContain('7')
      expect(options.retry).toBe(false)
    }
  })
})
