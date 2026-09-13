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
| 7         | CURRENT  | Wallet / Gift Card                                                       |
| 8         | PLANNED  | Support                                                                  |
| 9         | PLANNED  | Referral / Commission / Withdrawal                                       |
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
- AUR-M7-002 Wallet Deposit Create + Payment Handoff：IMPLEMENTATION COMPLETE，INDEPENDENT REVIEW PENDING
- AUR-M7-003 Gift Card Redeem：NOT STARTED

AUR-M7-002 只创建 solution 权威 Deposit Order，并以明确导航移交既有 Orders / Payment flow。余额仍只
由 `GET /api/v1/wallet` 决定；本任务不实现 Gift Card、第二套 Checkout、ledger、pending balance、
bonus/fee 计算或 callback state。Production Wallet Deposit runtime 仍为 NOT TESTED。
