import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { customPagesApi } from '@/features/custom-pages/custom-pages-api'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { resetSessionSafetyRuntimeForTests } from '@/lib/auth/session-safety-storage'
import { resetFinancialMutationRuntimeForTests } from '@/features/referrals/financial-mutation-runtime'

beforeEach(() => {
  vi.spyOn(customPagesApi, 'getList').mockResolvedValue({ items: [] })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
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
