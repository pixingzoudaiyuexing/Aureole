import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  ThemeProvider,
  useTheme,
  type Theme,
} from '@/app/providers/theme-provider'

function ThemeHarness() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const themes: Theme[] = ['system', 'light', 'dark']

  return (
    <div>
      <output>{`${theme}:${resolvedTheme}`}</output>
      {themes.map((option) => (
        <button key={option} onClick={() => setTheme(option)}>
          {option}
        </button>
      ))}
    </div>
  )
}

describe('ThemeProvider', () => {
  it('resolves system preference and persists explicit choices', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )

    expect(screen.getByText('system:dark')).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'light' }))
    expect(screen.getByText('light:light')).toBeInTheDocument()
    expect(window.localStorage.getItem('aureole-theme')).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'dark' }))
    expect(screen.getByText('dark:dark')).toBeInTheDocument()
    expect(window.localStorage.getItem('aureole-theme')).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'system' }))
    expect(screen.getByText('system:dark')).toBeInTheDocument()
    expect(window.localStorage.getItem('aureole-theme')).toBeNull()
  })
})
