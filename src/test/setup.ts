import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { customPagesApi } from '@/features/custom-pages/custom-pages-api'
import { runtimeSettingsApi } from '@/features/runtime-settings/runtime-settings-api'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { resetSessionSafetyRuntimeForTests } from '@/lib/auth/session-safety-storage'
import { resetFinancialMutationRuntimeForTests } from '@/features/referrals/financial-mutation-runtime'

beforeEach(() => {
  document.title = 'Aureole'
  if (!document.head.querySelector('meta[name="description"]')) {
    const description = document.createElement('meta')
    description.name = 'description'
    document.head.append(description)
  }
  document.head
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute('content', 'Aureole account and subscription management')
  vi.spyOn(customPagesApi, 'getList').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeSettingsApi, 'getRuntimeSettings').mockResolvedValue({
    siteName: null,
    brandName: null,
    title: null,
    description: null,
    logoUrl: null,
    faviconUrl: null,
    footerText: null,
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.title = 'Aureole'
  document.head
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute('content', 'Aureole account and subscription management')
  document.head
    .querySelectorAll('link[data-runtime-settings-favicon="true"]')
    .forEach((element) => element.remove())
  resetFinancialMutationRuntimeForTests()
  resetSessionSafetyRuntimeForTests()
  useAuthSessionStore.setState({
    accessToken: null,
    generation: 0,
    hydrated: false,
  })
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: () => undefined,
})
