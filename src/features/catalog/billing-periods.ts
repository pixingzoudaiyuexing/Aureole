import type { BillingPeriod } from './catalog-api'

export const billingPeriodLabels: Record<BillingPeriod, string> = {
  month: '月付',
  quarter: '季付',
  halfYear: '半年付',
  year: '年付',
  twoYears: '两年付',
  threeYears: '三年付',
  oneTime: '一次性',
}
