import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from '@/app/router/router'
import { AppProviders } from '@/app/providers/app-providers'

describe('application router', () => {
  it('renders the public login skeleton from the root redirect', async () => {
    const router = createAppRouter({ initialEntries: ['/'] })

    render(<AppProviders router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'Sign in to Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
