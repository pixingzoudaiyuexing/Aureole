import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, '请输入邮箱地址')
    .max(254, '邮箱地址不能超过 254 个字符')
    .email('请输入有效的邮箱地址'),
  password: z
    .string()
    .min(8, '密码至少需要 8 个字符')
    .max(1024, '密码不能超过 1024 个字符'),
})

export const loginResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    tokenType: z.literal('Bearer'),
  })
  .strip()

const currentUserSchema = z
  .object({
    email: z.string().email(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(['active', 'expired', 'disabled']),
  })
  .strip()

export type LoginInput = z.infer<typeof loginSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
export type CurrentUser = z.infer<typeof currentUserSchema>

export interface AuthApi {
  login: (input: LoginInput) => Promise<LoginResponse>
  getCurrentUser: (accessToken: string) => Promise<CurrentUser>
}

export function parsePublicData<T>(schema: z.ZodType<T>, data: unknown) {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The public API returned an invalid response',
    })
  }
  return parsed.data
}

export const authApi: AuthApi = {
  async login(input) {
    const data = await apiClient.request<unknown>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
    })
    return parsePublicData(loginResponseSchema, data)
  },
  async getCurrentUser(accessToken) {
    const data = await apiClient.authenticatedRequest<unknown>('/api/v1/me', {
      method: 'GET',
      accessToken,
    })
    return parsePublicData(currentUserSchema, data)
  },
}
