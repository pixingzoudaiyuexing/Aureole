import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { useAuthSessionStore } from '@/lib/auth/session-store'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  useAuthSessionStore.setState({ accessToken: null, hydrated: false })
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
