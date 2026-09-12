export interface RecaptchaRenderOptions {
  sitekey: string
  theme: 'light' | 'dark'
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

export interface RecaptchaV2Api {
  ready: (callback: () => void) => void
  render: (container: HTMLElement, options: RecaptchaRenderOptions) => number
  reset: (widgetId: number) => void
}

declare global {
  interface Window {
    grecaptcha?: RecaptchaV2Api
  }
}
