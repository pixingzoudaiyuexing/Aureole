import type { OrderStatus } from './orders-api'

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: '待支付',
  processing: '已支付，开通处理中',
  cancelled: '已取消',
  completed: '已完成',
  adjusted: '已用于套餐变更折抵',
}
