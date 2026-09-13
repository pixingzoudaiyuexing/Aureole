import { describe, expect, it } from 'vitest'
import {
  formatSignedMinorMoney,
  parseMoneyInputToMinor,
} from '@/features/catalog/money-format'

describe('Exact human money input conversion', () => {
  it.each([
    ['1', 100],
    ['1.0', 100],
    ['1.00', 100],
    ['0.01', 1],
    ['21474836.47', 2_147_483_647],
  ] as const)('parses CNY %s exactly', (input, expected) => {
    expect(parseMoneyInputToMinor(input, 'CNY')).toBe(expected)
  })

  it.each([
    '21474836.48',
    '1.001',
    '0',
    '-1',
    '1e2',
    'abc',
    '',
    'NaN',
    'Infinity',
  ])('rejects invalid CNY input %j', (input) => {
    expect(parseMoneyInputToMinor(input, 'CNY')).toBeNull()
  })

  it.each([
    ['1', 1],
    ['100', 100],
  ] as const)('parses JPY %s exactly', (input, expected) => {
    expect(parseMoneyInputToMinor(input, 'JPY')).toBe(expected)
  })

  it.each(['1.0', '0.01'])('rejects fractional JPY input %j', (input) => {
    expect(parseMoneyInputToMinor(input, 'JPY')).toBeNull()
  })

  it('fails closed when Intl cannot identify canonical fraction digits', () => {
    expect(parseMoneyInputToMinor('1', 'ZZZ')).toBeNull()
    expect(parseMoneyInputToMinor('1', 'not-a-currency')).toBeNull()
  })
})

describe('Signed minor-unit money formatting', () => {
  it.each([
    [100, 'CNY', '¥', '¥1.00 CNY'],
    [-100, 'CNY', '¥', '-¥1.00 CNY'],
    [0, 'CNY', '¥', '¥0.00 CNY'],
    [100, 'JPY', '¥', '¥100 JPY'],
    [-100, 'JPY', '¥', '-¥100 JPY'],
  ] as const)(
    'formats %i %s without changing the sign',
    (amountMinor, currency, currencySymbol, expected) => {
      expect(
        formatSignedMinorMoney(amountMinor, { currency, currencySymbol }),
      ).toBe(expected)
    },
  )

  it.each([
    [1, 'ZZZ'],
    [Number.MAX_SAFE_INTEGER + 1, 'CNY'],
    [2_147_483_648, 'CNY'],
    [-2_147_483_649, 'CNY'],
  ] as const)(
    'fails closed for unsafe %i %s input',
    (amountMinor, currency) => {
      expect(
        formatSignedMinorMoney(amountMinor, {
          currency,
          currencySymbol: '¥',
        }),
      ).toBeNull()
    },
  )
})
