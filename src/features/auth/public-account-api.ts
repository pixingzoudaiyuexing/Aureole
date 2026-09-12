import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { loginResponseSchema, parsePublicData } from './auth-api'

export const accountEmailSchema = z
  .string()
  .trim()
  .min(1, '请输入邮箱地址')
  .max(254, '邮箱地址不能超过 254 个字符')
  .email('请输入有效的邮箱地址')
export const accountPasswordSchema = z
  .string()
  .min(8, '密码至少需要 8 个字符')
  .max(64, '密码不能超过 64 个字符')
export const accountEmailCodeSchema = z
  .string()
  .regex(/^\d{6}$/, '请输入 6 位数字验证码')
export const accountInviteCodeSchema = z
  .string()
  .trim()
  .min(1, '请输入邀请码')
  .max(255, '邀请码不能超过 255 个字符')
const challengeTokenSchema = z.string().min(1).max(4096)

const emailCodeRequestSchema = z
  .object({
    email: accountEmailSchema,
    purpose: z.enum(['register', 'password-reset']),
    challengeToken: challengeTokenSchema.optional(),
  })
  .strict()

const registerRequestSchema = z
  .object({
    email: accountEmailSchema,
    password: accountPasswordSchema,
    emailCode: accountEmailCodeSchema.optional(),
    inviteCode: accountInviteCodeSchema.optional(),
    challengeToken: challengeTokenSchema.optional(),
  })
  .strict()

const passwordResetRequestSchema = z
  .object({
    email: accountEmailSchema,
    emailCode: accountEmailCodeSchema,
    newPassword: accountPasswordSchema,
  })
  .strict()

const emailCodeResponseSchema = z.object({ sent: z.literal(true) }).strip()
const passwordResetResponseSchema = z.object({ reset: z.literal(true) }).strip()

const safeTermsUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value)
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        Boolean(parsed.hostname) &&
        !parsed.username &&
        !parsed.password
      )
    } catch {
      return false
    }
  })

const nonEmptyCapabilityValueSchema = z.string().min(1)
const antiBotWireSchema = z
  .object({
    enabled: z.boolean(),
    provider: nonEmptyCapabilityValueSchema.nullable(),
    mode: nonEmptyCapabilityValueSchema.nullable(),
    siteKey: z.string().min(1).max(4096).nullable(),
  })
  .strip()

const onboardingWireSchema = z
  .object({
    termsUrl: safeTermsUrlSchema.nullable(),
    emailVerificationRequired: z.boolean(),
    inviteCodeRequired: z.boolean(),
    emailSuffixWhitelist: z
      .array(
        z
          .string()
          .max(255)
          .refine((value) => value.trim().length > 0),
      )
      .max(255)
      .nullable(),
    antiBot: antiBotWireSchema,
  })
  .strip()

export type EmailCodePurpose = 'register' | 'password-reset'

export type AntiBotCapability =
  | { state: 'disabled' }
  | {
      state: 'supported'
      provider: 'recaptcha'
      mode: 'v2-checkbox'
      siteKey: string
    }
  | { state: 'unsupported'; provider: string; mode: string }

export interface OnboardingConfig {
  termsUrl: string | null
  emailVerificationRequired: boolean
  inviteCodeRequired: boolean
  emailSuffixWhitelist: string[] | null
  antiBot: AntiBotCapability
}

export interface EmailCodeInput {
  email: string
  purpose: EmailCodePurpose
  challengeToken?: string
}

export interface RegisterInput {
  email: string
  password: string
  emailCode?: string
  inviteCode?: string
  challengeToken?: string
}

export interface PasswordResetInput {
  email: string
  emailCode: string
  newPassword: string
}

function malformedResponse(): never {
  throw new ApiError({
    status: 200,
    code: 'MALFORMED_RESPONSE',
    message: 'The public API returned an invalid response',
  })
}

function parseAntiBot(
  antiBot: z.infer<typeof antiBotWireSchema>,
): AntiBotCapability {
  if (!antiBot.enabled) {
    if (
      antiBot.provider !== null ||
      antiBot.mode !== null ||
      antiBot.siteKey !== null
    ) {
      return malformedResponse()
    }
    return { state: 'disabled' }
  }

  if (antiBot.provider === null || antiBot.mode === null) {
    return malformedResponse()
  }

  if (antiBot.provider === 'recaptcha' && antiBot.mode === 'v2-checkbox') {
    if (antiBot.siteKey === null) return malformedResponse()
    return {
      state: 'supported',
      provider: 'recaptcha',
      mode: 'v2-checkbox',
      siteKey: antiBot.siteKey,
    }
  }

  return {
    state: 'unsupported',
    provider: antiBot.provider,
    mode: antiBot.mode,
  }
}

export function parseOnboardingConfig(data: unknown): OnboardingConfig {
  const parsed = onboardingWireSchema.safeParse(data)
  if (!parsed.success) return malformedResponse()

  return {
    termsUrl: parsed.data.termsUrl,
    emailVerificationRequired: parsed.data.emailVerificationRequired,
    inviteCodeRequired: parsed.data.inviteCodeRequired,
    emailSuffixWhitelist: parsed.data.emailSuffixWhitelist,
    antiBot: parseAntiBot(parsed.data.antiBot),
  }
}

export const publicAccountApi = {
  async getOnboardingConfig() {
    const data = await apiClient.request<unknown>('/api/v1/config/onboarding')
    return parseOnboardingConfig(data)
  },

  async sendEmailCode(input: EmailCodeInput) {
    const request = emailCodeRequestSchema.parse(input)
    const data = await apiClient.request<unknown>('/api/v1/auth/email-code', {
      method: 'POST',
      body: request,
    })
    return parsePublicData(emailCodeResponseSchema, data)
  },

  async register(input: RegisterInput) {
    const request = registerRequestSchema.parse(input)
    const data = await apiClient.request<unknown>('/api/v1/auth/register', {
      method: 'POST',
      body: request,
    })
    return parsePublicData(loginResponseSchema, data)
  },

  async resetPassword(input: PasswordResetInput) {
    const request = passwordResetRequestSchema.parse(input)
    const data = await apiClient.request<unknown>(
      '/api/v1/auth/password/reset',
      { method: 'POST', body: request },
    )
    return parsePublicData(passwordResetResponseSchema, data)
  },
}
