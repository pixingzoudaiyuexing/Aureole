# Roadmap

| Milestone | Status   | Scope                                                                    |
| --------- | -------- | ------------------------------------------------------------------------ |
| 0         | COMPLETE | Product framing and workflow baseline                                    |
| 1         | COMPLETE | solution Public Contract and upstream architecture baseline              |
| 2         | COMPLETE | Aureole repository, frontend foundation, app shell, quality and Git SSOT |
| 3         | COMPLETE | Auth / Account                                                           |
| 4         | COMPLETE | Read-only Core                                                           |
| 5         | COMPLETE | Commerce / Payment                                                       |
| 6         | CURRENT  | Subscription Mutations                                                   |
| 7         | PLANNED  | Wallet / Gift Card                                                       |
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

- AUR-M6-001 Rotate Subscription Access：IMPLEMENTATION COMPLETE，Independent Review PENDING
- AUR-M6-002 Advance Period：NOT STARTED

AUR-M6-001 仅实现危险 credential rotation、权威 Access 对账、UNKNOWN fail-closed recovery 与
Auth invalidation。Production Subscription Rotation runtime 仍为 NOT TESTED。
