# API Mapping

## SSOT rule

本文不复制 endpoint matrix、METHOD、PATH、DTO 或 errors。它们的最终 SSOT 是只读上游 `solution/docs/API-CONTRACT.md`。实现 feature 前必须读取当时的 Contract；Aureole 不通过猜测或 V2Board route 补齐缺失能力。

## Stable domain mapping

| Aureole feature                     | solution Public API domain              | Frontend behavior                                                       |
| ----------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Auth and onboarding                 | Auth, onboarding config                 | 校验输入、处理 public error code、建立真实 session lifecycle            |
| Account                             | Me, preferences, stats, account config  | 只显示 Public DTO，不暴露上游用户模型                                   |
| Products / Plans                    | Products                                | 显示已认证 catalog；Order Create 是最终购买资格权威                     |
| Orders / Payment                    | Orders, billing, checkout, promotions   | 轮询权威订单状态；优惠仅 preview；不持有 callback 状态                  |
| Subscription                        | Subscription overview and mutations     | Query owns state；mutation 后按 Contract invalidate；未知结果不盲目重试 |
| Resources / Traffic                 | Resources, traffic logs                 | 只显示白名单字段；Traffic 使用 compact list                             |
| Wallet / Gift Card                  | Wallet, deposits, gift card redeem      | 不计算余额；兑换成功至少刷新 Wallet、Subscription Overview、Me          |
| Notices                             | Notices                                 | 不发明 unread 或 important 状态                                         |
| Support                             | Tickets                                 | message 视为敏感用户内容，不记录 raw payload                            |
| Referrals / Commission / Withdrawal | Referrals and guarded financial actions | 佣金、资格、minimum 与工单状态以上游为权威                              |

## Error and request rules

- 业务分支依据稳定 `error.code`，禁止依据 message 文本包含关系。
- 保留 HTTP status 与 requestId，向用户提供可理解的恢复路径。
- malformed JSON/envelope、network failure 与 public error 分开处理。
- Mutation 默认不 retry；非幂等操作 timeout 后先刷新权威读取接口。
- API origin 来自 `VITE_API_BASE_URL`；请求路径必须属于 `/api/v1`。
- 不发送或记录 V2Board Secret、raw DTO、Authorization Header 或完整敏感 payload。
