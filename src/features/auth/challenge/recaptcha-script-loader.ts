import type { RecaptchaV2Api } from './recaptcha-types'

const SCRIPT_ID = 'aureole-recaptcha-v2-script'
const SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit'

let loaderPromise: Promise<RecaptchaV2Api> | null = null

function resolveReadyApi(resolve: (api: RecaptchaV2Api) => void) {
  const api = window.grecaptcha
  if (!api) throw new Error('reCAPTCHA API unavailable')
  api.ready(() => resolve(api))
}

export function loadRecaptchaV2Checkbox(): Promise<RecaptchaV2Api> {
  if (window.grecaptcha) {
    return new Promise((resolve) => resolveReadyApi(resolve))
  }
  if (loaderPromise) return loaderPromise

  loaderPromise = new Promise<RecaptchaV2Api>((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const created = script === null

    const fail = () => {
      loaderPromise = null
      if (created) script?.remove()
      reject(new Error('Unable to load reCAPTCHA'))
    }
    const complete = () => {
      try {
        resolveReadyApi(resolve)
      } catch {
        fail()
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_URL
      script.async = true
      script.defer = true
    }

    script.addEventListener('load', complete, { once: true })
    script.addEventListener('error', fail, { once: true })
    if (created) document.head.append(script)
  })

  return loaderPromise
}
