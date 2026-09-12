# Product Scope

## Frozen v1 scope

v1 包含以下用户域：

- Authentication：登录、注册、邮箱验证和密码找回。
- Account：当前用户、偏好、密码和账户统计。
- Subscription：概览、Access、Rotate Access、Advance Period。
- Products and Plans：已认证用户的产品列表与详情。
- Orders and Payment：订单、Checkout、QR/redirect 状态确认和优惠预览。
- Resources and Traffic：已认证资源与 Compact Traffic List。
- Wallet：余额与充值。
- Gift Card：兑换流程。
- Notices：公告列表与详情。
- Support：Ticket 列表、详情、创建、回复和关闭。
- Referrals：邀请码与推荐概览。
- Commission：佣金记录与转入钱包。
- Withdrawal：提现选项与人工申请确认。

Gift Card、Withdrawal、Commission、Wallet 都属于 v1，不得在后续计划中遗漏。具体可用能力以 solution Public Contract 为准，不得用前端模拟补齐。

## Current non-goals

- Public Plans 不是 v1；产品信息仅面向已认证用户。
- Marketing Homepage 不是 v1；`/` 根据当前 Auth State 进入 `/login` 或 `/dashboard`。
- Public Resource Status 是 Post-v1 Enhancement；不要与 v1 的 authenticated Resources 混淆。
- 不提供 Gift Card 管理、自动打款、Withdrawal admin、Fake Analytics 或任何 V2Board 管理能力。

## Ownership

V2Board 持有用户、订单、支付、订阅、钱包、Ticket、公告、流量、推荐、佣金、提现和 Gift Card 的业务状态。solution 提供公开 Contract；Aureole 只展示 Public DTO 并发起明确的用户操作，不计算权威金额、周期、余额或最终支付结果。
