import { createRef, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/providers/theme-provider'
import {
  ChallengeField,
  type ChallengeFieldHandle,
} from '@/features/auth/challenge/challenge-field'
import { loadRecaptchaV2Checkbox } from '@/features/auth/challenge/recaptcha-script-loader'
import type {
  RecaptchaRenderOptions,
  RecaptchaV2Api,
} from '@/features/auth/challenge/recaptcha-types'
import type { AntiBotCapability } from '@/features/auth/public-account-api'

const supportedCapability: AntiBotCapability = {
  state: 'supported',
  provider: 'recaptcha',
  mode: 'v2-checkbox',
  siteKey: 'public-site-key',
}

function createRecaptchaApi() {
  let options: RecaptchaRenderOptions | null = null
  const api: RecaptchaV2Api = {
    ready: (callback) => callback(),
    render: vi.fn((_, renderOptions) => {
      options = renderOptions
      return 7
    }),
    reset: vi.fn(),
  }
  return {
    api,
    getOptions: () => {
      if (!options) throw new Error('Widget was not rendered')
      return options
    },
  }
}

function renderChallenge(
  capability: AntiBotCapability,
  loadApi: () => Promise<RecaptchaV2Api>,
  ref = createRef<ChallengeFieldHandle>(),
) {
  const onTokenChange = vi.fn()
  render(
    <ThemeProvider>
      <ChallengeField
        ref={ref}
        capability={capability}
        loadApi={loadApi}
        onTokenChange={onTokenChange}
      />
    </ThemeProvider>,
  )
  return { onTokenChange, ref }
}

afterEach(() => {
  document.getElementById('aureole-recaptcha-v2-script')?.remove()
  delete window.grecaptcha
})

describe('ChallengeField', () => {
  it.each([
    [{ state: 'disabled' } as const, false],
    [
      {
        state: 'unsupported',
        provider: 'future-provider',
        mode: 'future-mode',
      } as const,
      true,
    ],
  ])('does not load the provider for $0', (capability, showsUnsupported) => {
    const loadApi = vi.fn<() => Promise<RecaptchaV2Api>>()
    renderChallenge(capability, loadApi)

    expect(loadApi).not.toHaveBeenCalled()
    if (showsUnsupported) {
      expect(screen.getByText('当前验证方式暂不受支持')).toBeInTheDocument()
    } else {
      expect(screen.queryByText('当前验证方式暂不受支持')).toBeNull()
    }
  })

  it('explicitly renders a visible checkbox and handles token lifecycle', async () => {
    const { api, getOptions } = createRecaptchaApi()
    const ref = createRef<ChallengeFieldHandle>()
    const loadApi = () => Promise.resolve(api)

    function Harness() {
      const [token, setToken] = useState<string | null>(null)
      return (
        <ThemeProvider>
          <ChallengeField
            ref={ref}
            capability={supportedCapability}
            loadApi={loadApi}
            onTokenChange={setToken}
          />
          <output data-testid="challenge-token">{token ?? 'none'}</output>
        </ThemeProvider>
      )
    }

    render(<Harness />)
    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    expect(getOptions()).toMatchObject({
      sitekey: 'public-site-key',
      theme: 'light',
    })

    act(() => getOptions().callback('challenge-token-a'))
    expect(screen.getByTestId('challenge-token')).toHaveTextContent(
      'challenge-token-a',
    )
    expect(api.render).toHaveBeenCalledOnce()

    act(() => getOptions()['expired-callback']())
    expect(screen.getByTestId('challenge-token')).toHaveTextContent('none')

    act(() => getOptions().callback('challenge-token-b'))
    act(() => ref.current?.reset())
    expect(screen.getByTestId('challenge-token')).toHaveTextContent('none')
    expect(api.reset).toHaveBeenCalledWith(7)

    act(() => getOptions()['error-callback']())
    expect(
      screen.getByText('人机验证加载失败，请检查网络后重试。'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('challenge-token')).toHaveTextContent('none')
  })

  it('fails closed on load error and allows controlled reload', async () => {
    const { api } = createRecaptchaApi()
    const loadApi = vi
      .fn<() => Promise<RecaptchaV2Api>>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(api)
    const user = userEvent.setup()
    renderChallenge(supportedCapability, loadApi)

    await screen.findByText('人机验证加载失败，请检查网络后重试。')
    await user.click(screen.getByRole('button', { name: '重新加载验证' }))

    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    expect(loadApi).toHaveBeenCalledTimes(2)
  })

  it('renders the checkbox with the resolved dark theme', async () => {
    window.localStorage.setItem('aureole-theme', 'dark')
    const { api, getOptions } = createRecaptchaApi()

    renderChallenge(supportedCapability, () => Promise.resolve(api))

    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    expect(getOptions().theme).toBe('dark')
  })

  it('deduplicates the official HTTPS script load', async () => {
    const { api } = createRecaptchaApi()
    const first = loadRecaptchaV2Checkbox()
    const second = loadRecaptchaV2Checkbox()
    const script = document.getElementById(
      'aureole-recaptcha-v2-script',
    ) as HTMLScriptElement

    expect(first).toBe(second)
    expect(
      document.querySelectorAll('#aureole-recaptcha-v2-script'),
    ).toHaveLength(1)
    expect(script.src).toBe(
      'https://www.google.com/recaptcha/api.js?render=explicit',
    )

    window.grecaptcha = api
    script.dispatchEvent(new Event('load'))
    await expect(first).resolves.toBe(api)
    await expect(second).resolves.toBe(api)
  })
})
