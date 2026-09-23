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

const currentUserSchema = z
  .object({
    email: z.string().email(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(['active', 'expired', 'disabled']),
    sessionVersion: z.string().uuid().optional(),
  })
  .strip()
const verifiedSessionUserSchema = currentUserSchema.extend({
  sessionVersion: z.string().uuid(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type LoginResponse = CurrentUser
export type CurrentUser = z.infer<typeof currentUserSchema>

export interface AuthApi {
  login: (input: LoginInput) => Promise<LoginResponse>
  getCurrentUser: (accessToken: string) => Promise<CurrentUser>
  prepareBrowser?: () => Promise<void>
  logout?: () => Promise<void>
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

export function parseSessionUser(data: unknown): CurrentUser {
  return parsePublicData(verifiedSessionUserSchema, data)
}

export const authApi: AuthApi = {
  async prepareBrowser() {
    await apiClient.request<unknown>('/api/v1/auth/browser')
  },
  async login(input) {
    await this.prepareBrowser?.()
    const data = await apiClient.request<unknown>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
    })
    return parseSessionUser(data)
  },
  async getCurrentUser() {
    const data = await apiClient.request<unknown>('/api/v1/auth/session')
    return parseSessionUser(data)
  },
  async logout() {
    await apiClient.request('/api/v1/auth/logout', { method: 'POST' })
  },
}
