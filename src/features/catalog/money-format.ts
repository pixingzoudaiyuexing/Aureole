import type { AccountConfig } from '@/features/account/account-api'

interface IntlCurrencySupport {
  supportedValuesOf?: (key: 'currency') => string[]
}

function currencyFractionDigits(currency: string) {
  const normalizedCurrency = currency.toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) return null

  const supportedValuesOf = (Intl as typeof Intl & IntlCurrencySupport)
    .supportedValuesOf
  if (!supportedValuesOf) return null

  try {
    if (!supportedValuesOf('currency').includes(normalizedCurrency)) return null
    const options = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: normalizedCurrency,
    }).resolvedOptions()
    const minimumFractionDigits = options.minimumFractionDigits
    const maximumFractionDigits = options.maximumFractionDigits
    if (
      typeof minimumFractionDigits !== 'number' ||
      typeof maximumFractionDigits !== 'number' ||
      minimumFractionDigits !== maximumFractionDigits
    ) {
      return null
    }
    return maximumFractionDigits
  } catch {
    return null
  }
}

export function parseMoneyInputToMinor(input: string, currency: string) {
  const fractionDigits = currencyFractionDigits(currency)
  if (fractionDigits === null) return null

  const normalizedInput = input.trim()
  const pattern =
    fractionDigits === 0
      ? /^\d+$/
      : new RegExp(`^\\d+(?:\\.\\d{1,${fractionDigits}})?$`)
  if (!pattern.test(normalizedInput)) return null

  const [major = '', fraction = ''] = normalizedInput.split('.')
  const scale = 10n ** BigInt(fractionDigits)
  const amountMinor =
    BigInt(major) * scale + BigInt(fraction.padEnd(fractionDigits, '0') || '0')

  if (amountMinor < 1n || amountMinor > 2_147_483_647n) return null
  return Number(amountMinor)
}

export function formatMinorMoney(
  amountMinor: number,
  { currency, currencySymbol }: AccountConfig,
) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return null
  const fractionDigits = currencyFractionDigits(currency)
  if (fractionDigits === null) return null

  const amount = BigInt(amountMinor)
  const scale = 10n ** BigInt(fractionDigits)
  const major = amount / scale
  const fraction = amount % scale
  const groupedMajor = new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 0,
  }).format(Number(major))
  const decimal =
    fractionDigits === 0
      ? ''
      : `.${fraction.toString().padStart(fractionDigits, '0')}`

  return `${currencySymbol}${groupedMajor}${decimal} ${currency}`
}

export function formatSignedMinorMoney(
  amountMinor: number,
  { currency, currencySymbol }: AccountConfig,
) {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < -2_147_483_648 ||
    amountMinor > 2_147_483_647
  ) {
    return null
  }
  const fractionDigits = currencyFractionDigits(currency)
  if (fractionDigits === null) return null

  const amount = BigInt(amountMinor)
  const negative = amount < 0n
  const magnitude = negative ? -amount : amount
  const scale = 10n ** BigInt(fractionDigits)
  const major = magnitude / scale
  const fraction = magnitude % scale
  const groupedMajor = new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 0,
  }).format(Number(major))
  const decimal =
    fractionDigits === 0
      ? ''
      : `.${fraction.toString().padStart(fractionDigits, '0')}`

  return `${negative ? '-' : ''}${currencySymbol}${groupedMajor}${decimal} ${currency}`
}
