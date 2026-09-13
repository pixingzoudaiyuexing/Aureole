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
- AUR-M7-002 Wallet Deposit Create + Payment Handoff：COMPLETE，Independent Financial Mutation Review PASS
- AUR-M7-003 Gift Card Redeem：IMPLEMENTATION COMPLETE，INDEPENDENT REVIEW PENDING

AUR-M7-003 只提交原样 credential-like code，并忠实展示 solution Public effect；成功与 UNKNOWN 均读取
Wallet、Me 与 Subscription Overview，但不从账户变化推断 mutation outcome。Deposit 与 Gift Card
金融 mutation 互斥。本任务不实现历史、preview、ledger 或后续 Milestone。Production Gift Card
runtime 仍为 NOT TESTED；Milestone 7 暂不标记 COMPLETE。
