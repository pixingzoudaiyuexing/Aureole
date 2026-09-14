# Roadmap

| Milestone | Status   | Scope                                                                    |
| --------- | -------- | ------------------------------------------------------------------------ |
| 0         | COMPLETE | Product framing and workflow baseline                                    |
| 1         | COMPLETE | solution Public Contract and upstream architecture baseline              |
| 2         | COMPLETE | Aureole repository, frontend foundation, app shell, quality and Git SSOT |
| 3         | COMPLETE | Auth / Account                                                           |
| 4         | COMPLETE | Read-only Core                                                           |
| 5         | COMPLETE | Commerce / Payment                                                       |
| 6         | COMPLETE | Subscription Mutations                                                   |
| 7         | COMPLETE | Wallet / Gift Card                                                       |
| 8         | COMPLETE | Support                                                                  |
| 9         | CURRENT  | Referral / Commission / Withdrawal                                       |
| 10        | PLANNED  | Launch Readiness                                                         |

## Post-v1 Enhancements

- Public Resource Status

Milestone 3 的 Auth Session Core、Registration / Password Recovery 与 Account Self-Service 已完成实现及独立审查。Milestone 4 按以下边界推进：

- M4-001 Subscription Read Model + Dashboard Core：COMPLETE，Independent Review PASS
- M4-002 Plans + Resources + Traffic：COMPLETE，Independent Review PASS
- M4-003 Notices + Dashboard Completion：COMPLETE，Independent Security/Notice Review PASS

M4-003 独立审查未发现 Blocker、High、Medium 或 Low 问题，也没有 Required Fixes；生产
runtime 未验证是已接受的非阻塞证据缺口。Milestone 4 已完成。

Milestone 5 按以下边界推进：

- M5-001 Orders Read Model：COMPLETE，Independent Review PASS
- M5-002 Order Create + Promotion + Cancel：COMPLETE，Independent Review PASS
- M5-003 Payment Methods + Checkout：COMPLETE，Independent Payment Review PASS

M5-003 已实现 Payment Methods、Checkout、QR/redirect/finished action、权威 Order Status recovery
与受控 polling，并已通过独立 Payment Review。Milestone 5 已完成并冻结。

Milestone 6 按以下边界推进：

- AUR-M6-001 Rotate Subscription Access：COMPLETE，Independent Security Review PASS
- AUR-M6-002 Advance Period：COMPLETE，Independent Subscription Mutation Review PASS

AUR-M6-002 仅实现危险 Advance Period、权威 Overview 对账、UNKNOWN fail-closed recovery、与
Rotate 的互斥及 Auth invalidation。Milestone 6 已完成并冻结。Production Subscription Rotation 与
Advance Period runtime 仍为 NOT TESTED。

Milestone 7 按以下边界推进：

- AUR-M7-001 Wallet Balance Read Model：COMPLETE，Independent Wallet/Auth Review PASS
- AUR-M7-002 Wallet Deposit Create + Payment Handoff：COMPLETE，Independent Financial Mutation Review PASS
- AUR-M7-003 Gift Card Redeem：COMPLETE，Independent Gift Card/Account Mutation Review PASS

Milestone 7 已完成并冻结。Production solution/V2Board Wallet、Deposit、Payment 与 Gift Card runtime
仍为 NOT TESTED，属于 Launch Readiness evidence gap。

Milestone 8 按以下边界推进：

- AUR-M8-001 Support Ticket Read Model：COMPLETE，Independent Support Read Review PASS
- AUR-M8-002 Create Ticket：COMPLETE，Independent Create Ticket Mutation Review PASS
- AUR-M8-003 Reply + Close Ticket：COMPLETE，Independent Support Mutation Review PASS

AUR-M8-002 只增量实现 `POST /api/v1/tickets`，并已通过独立审查。Create 原样提交 strict Public
fields、禁止自动 retry，使用同步锁与 authoritative List recovery；confirmed success 不推断 Ticket ID，
UNKNOWN 不推断结果且再次提交前要求用户核对 List。

Independent Create Ticket Mutation Review 的 required fix 已增加 canonical List authority gate：只有当前
页面生命周期中的 List read 已成功且不在 fetching 时才允许 Create。初始/重试/缓存 refetch failure 与
UNKNOWN/confirmed-success remount 均 fail closed。

AUR-M8-003 只增量实现 Reply 与 Close，并集成现有 Ticket Detail。两个 mutation 由 fresh authoritative
Detail gate 与共享 synchronous lock 约束；confirmed success、definitive error 与 UNKNOWN 都通过 GET
Detail/List 对账，不本地 append message 或改 status。UNKNOWN recovery 不依据相同消息或当前 status
推断因果结果，再次执行需 acknowledgement，Close 另有独立 confirmation。Attachment、unread、
search/filter 均未实现。Production Ticket Read/Create/Reply/Close runtime 仍为 NOT TESTED，属于 Launch
Readiness evidence gap。Milestone 8 已完成并冻结于
`9736f3740f27d8b492d3affec4488c8cd59ebf0c`。

Milestone 9 按以下边界推进：

- AUR-M9-001 Referral / Commission Read Model：COMPLETE，INDEPENDENT REVIEW PASS，冻结于
  `445ffac542d89977f2db5b631516b6c3bbdc955f`
- AUR-M9-002 Create Referral Code：IMPLEMENTATION COMPLETE，INDEPENDENT REVIEW REQUIRED FIXES APPLIED，
  TARGETED RE-REVIEW PENDING
- AUR-M9-003 Commission Transfer：NOT STARTED
- AUR-M9-004 Withdrawal Request：NOT STARTED

AUR-M9-002 只增量实现 bodyless `POST /api/v1/referrals/codes`。Create 使用 fresh Overview authority、
标准 confirmation、同步锁、`retry:false` 和 Overview-only reconciliation；confirmed success 不认领具体 code，
UNKNOWN 不根据 list diff 推断结果。Required fixes 增加 authenticated-session memory uncertainty guard，确保
UNKNOWN 跨 feature remount 保留到明确 acknowledgement，并在 POST 前直接读取 QueryClient current authority
关闭 stale React prop race。Commission Transfer、Withdrawal Request 与 Launch Readiness 未开始。
Production Referral / Commission / Withdrawal / Create runtime 为 NOT TESTED。
