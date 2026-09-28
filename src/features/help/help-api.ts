import { z } from 'zod'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const idSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((id) => Number(id) <= 2_147_483_647)
const categorySchema = z
  .object({
    name: z.string().min(1),
    articleCount: z.number().int().nonnegative(),
  })
  .strip()
const summarySchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    category: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strip()

export type HelpInline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'emphasis'; children: HelpInline[] }
  | { type: 'link'; href: string; children: HelpInline[] }
  | { type: 'image'; src: string; alt: string }
  | {
      type: 'download'
      itemId: string
      slot: 'primary' | 'backup'
      label: string
      href: string
    }
  | { type: 'break' }

export type HelpBlock =
  | { type: 'heading'; level: 1 | 2 | 3; children: HelpInline[] }
  | { type: 'paragraph'; children: HelpInline[] }
  | { type: 'unordered-list' | 'ordered-list'; items: HelpInline[][] }

const inlineSchema: z.ZodType<HelpInline> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }).strip(),
    z
      .object({ type: z.literal('strong'), children: z.array(inlineSchema) })
      .strip(),
    z
      .object({ type: z.literal('emphasis'), children: z.array(inlineSchema) })
      .strip(),
    z
      .object({
        type: z.literal('link'),
        href: z.string(),
        children: z.array(inlineSchema),
      })
      .strip(),
    z
      .object({ type: z.literal('image'), src: z.string(), alt: z.string() })
      .strip(),
    z
      .object({
        type: z.literal('download'),
        itemId: z.string().min(1),
        slot: z.enum(['primary', 'backup']),
        label: z.string().min(1),
        href: z.string(),
      })
      .strip(),
    z.object({ type: z.literal('break') }).strip(),
  ]),
)

const blockSchema: z.ZodType<HelpBlock> = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('heading'),
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      children: z.array(inlineSchema),
    })
    .strip(),
  z
    .object({ type: z.literal('paragraph'), children: z.array(inlineSchema) })
    .strip(),
  z
    .object({
      type: z.literal('unordered-list'),
      items: z.array(z.array(inlineSchema)),
    })
    .strip(),
  z
    .object({
      type: z.literal('ordered-list'),
      items: z.array(z.array(inlineSchema)),
    })
    .strip(),
])

const categoriesSchema = z
  .object({ categories: z.array(categorySchema) })
  .strip()
const articlesSchema = z
  .object({
    items: z.array(summarySchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(50),
    total: z.number().int().nonnegative(),
  })
  .strip()
const detailSchema = z
  .object({ article: summarySchema.extend({ blocks: z.array(z.unknown()) }) })
  .strip()

export type HelpCategory = z.infer<typeof categorySchema>
export type HelpArticleSummary = z.infer<typeof summarySchema>
export interface HelpArticleDetail extends HelpArticleSummary {
  blocks: HelpBlock[]
}
export interface HelpFilters {
  category?: string
  q?: string
  page: number
}

function malformed(): never {
  throw new ApiError({
    status: 200,
    code: 'MALFORMED_RESPONSE',
    message: 'The public API returned an invalid response',
  })
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  return parsed.success ? parsed.data : malformed()
}

function parseDetail(data: unknown): HelpArticleDetail {
  if (
    data &&
    typeof data === 'object' &&
    'article' in data &&
    data.article &&
    typeof data.article === 'object'
  ) {
    for (const field of [
      'body',
      'rawBody',
      'content',
      'html',
      'token',
      'accessUrl',
      'subscribeUrl',
    ]) {
      if (field in data.article) malformed()
    }
  }
  const parsed = parse(detailSchema, data).article
  const blocks: HelpBlock[] = []
  for (const candidate of parsed.blocks) {
    if (!candidate || typeof candidate !== 'object' || !('type' in candidate))
      malformed()
    if (
      !['heading', 'paragraph', 'unordered-list', 'ordered-list'].includes(
        String(candidate.type),
      )
    )
      continue
    blocks.push(parse(blockSchema, candidate))
  }
  return { ...parsed, blocks }
}

export const helpApi = {
  async getCategories(accessToken: string) {
    const data = await apiClient.authenticatedRequest<unknown>(
      '/api/v1/help/categories',
      { method: 'GET', accessToken },
    )
    return parse(categoriesSchema, data)
  },
  async getArticles(accessToken: string, filters: HelpFilters) {
    const params = new URLSearchParams()
    if (filters.category) params.set('category', filters.category)
    if (filters.q) params.set('q', filters.q)
    params.set('page', String(filters.page))
    params.set('pageSize', '20')
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/help/articles?${params}`,
      { method: 'GET', accessToken },
    )
    return parse(articlesSchema, data)
  },
  async getArticle(accessToken: string, id: string) {
    if (!idSchema.safeParse(id).success) malformed()
    const data = await apiClient.authenticatedRequest<unknown>(
      `/api/v1/help/articles/${id}`,
      { method: 'GET', accessToken },
    )
    return parseDetail(data)
  },
}
