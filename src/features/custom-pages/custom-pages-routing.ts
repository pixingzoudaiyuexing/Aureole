import type { CustomPage } from './custom-pages-api'

const customPageIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function getCustomPageById(id: string, pages: readonly CustomPage[]) {
  return pages.find((page) => page.id === id) ?? null
}

export function getIframeCustomPageById(
  id: string,
  pages: readonly CustomPage[],
) {
  const page = getCustomPageById(id, pages)
  return page?.mode === 'iframe' ? page : null
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
