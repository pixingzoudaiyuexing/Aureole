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
