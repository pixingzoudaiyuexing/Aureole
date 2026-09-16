export const supportedCustomPageIcons = ['book', 'activity', 'panel'] as const

export type SupportedCustomPageIcon = (typeof supportedCustomPageIcons)[number]
export type CustomPageMode = 'external' | 'iframe'

export interface CustomPage {
  id: string
  title: string
  url: string
  mode: CustomPageMode
  enabled: boolean
  order?: number
  icon?: SupportedCustomPageIcon
}

const customPageIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const allowedKeys = new Set([
  'id',
  'title',
  'url',
  'mode',
  'enabled',
  'order',
  'icon',
])

export const customPageDefinitions = [] as const satisfies readonly CustomPage[]

function configError(index: number, message: string): never {
  throw new Error(`Invalid custom page config at index ${index}: ${message}`)
}

function validateHttpsUrl(value: unknown, index: number) {
  const hasControlOrSpace =
    typeof value === 'string' &&
    [...value].some((character) => character.charCodeAt(0) <= 0x20)
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2048 ||
    value.trim() !== value ||
    hasControlOrSpace
  ) {
    configError(index, 'url must be a non-empty bounded HTTPS URL')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    configError(index, 'url must be an absolute HTTPS URL')
  }

  if (parsed.protocol !== 'https:') {
    configError(index, 'url protocol must be https:')
  }
  if (!parsed.hostname) {
    configError(index, 'url must include a hostname')
  }
  if (parsed.username || parsed.password) {
    configError(index, 'url credentials are not allowed')
  }
  return value
}

export function validateCustomPages(value: unknown): CustomPage[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid custom page config: expected an array')
  }

  const ids = new Set<string>()
  const pages = value.map((entry: unknown, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return configError(index, 'entry must be an object')
    }
    const candidate = entry as Record<string, unknown>
    for (const key of Object.keys(candidate)) {
      if (!allowedKeys.has(key)) configError(index, `unknown field ${key}`)
    }

    const id = candidate.id
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      id.length > 64 ||
      !customPageIdPattern.test(id)
    ) {
      configError(index, 'id must be a lowercase ASCII slug')
    }
    if (ids.has(id)) configError(index, `duplicate id ${id}`)
    ids.add(id)

    const title = candidate.title
    if (
      typeof title !== 'string' ||
      title.length === 0 ||
      title.length > 120 ||
      title.trim() !== title
    ) {
      configError(
        index,
        'title must be non-empty, trimmed, and at most 120 characters',
      )
    }

    const mode = candidate.mode
    if (mode !== 'external' && mode !== 'iframe') {
      configError(index, 'mode must be external or iframe')
    }
    if (typeof candidate.enabled !== 'boolean') {
      configError(index, 'enabled must be a boolean')
    }

    const order = candidate.order
    if (
      order !== undefined &&
      (typeof order !== 'number' || !Number.isSafeInteger(order))
    ) {
      configError(index, 'order must be a safe integer when provided')
    }

    const icon = candidate.icon
    if (
      icon !== undefined &&
      !supportedCustomPageIcons.includes(icon as SupportedCustomPageIcon)
    ) {
      configError(index, 'icon is not supported')
    }

    return {
      id,
      title,
      url: validateHttpsUrl(candidate.url, index),
      mode,
      enabled: candidate.enabled,
      ...(order === undefined ? {} : { order }),
      ...(icon === undefined ? {} : { icon: icon as SupportedCustomPageIcon }),
    } satisfies CustomPage
  })

  return pages
}

export const customPages = validateCustomPages(customPageDefinitions)

export function getEnabledCustomPages(
  pages: readonly CustomPage[] = customPages,
) {
  return pages
    .map((page, sourceIndex) => ({ page, sourceIndex }))
    .filter(({ page }) => page.enabled)
    .sort((left, right) => {
      const leftOrder = left.page.order
      const rightOrder = right.page.order
      if (leftOrder === undefined && rightOrder === undefined) {
        return left.sourceIndex - right.sourceIndex
      }
      if (leftOrder === undefined) return 1
      if (rightOrder === undefined) return -1
      return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex
    })
    .map(({ page }) => page)
}

export function getCustomPageById(
  id: string,
  pages: readonly CustomPage[] = customPages,
) {
  return pages.find((page) => page.id === id) ?? null
}

export function getIframeCustomPageById(
  id: string,
  pages: readonly CustomPage[] = customPages,
) {
  const page = getCustomPageById(id, pages)
  return page?.enabled && page.mode === 'iframe' ? page : null
}

export function getCustomPagePath(id: string) {
  return `/custom/${id}` as const
}

export function getCustomPageIdFromPath(pathname: string) {
  const match = pathname.match(/^\/custom\/([^/]+)$/)
  if (!match?.[1]) return null
  try {
    const id = decodeURIComponent(match[1])
    return customPageIdPattern.test(id) ? id : null
  } catch {
    return null
  }
}

export function isCustomPageRoutePath(pathname: string) {
  return pathname.startsWith('/custom/')
}
