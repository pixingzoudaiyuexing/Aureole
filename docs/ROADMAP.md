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
| 8         | CURRENT  | Support                                                                  |
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
- AUR-M7-003 Gift Card Redeem：COMPLETE，Independent Gift Card/Account Mutation Review PASS

Milestone 7 已完成并冻结。Production solution/V2Board Wallet、Deposit、Payment 与 Gift Card runtime
仍为 NOT TESTED，属于 Launch Readiness evidence gap。

Milestone 8 按以下边界推进：

- AUR-M8-001 Support Ticket Read Model：COMPLETE，Independent Support Read Review PASS
- AUR-M8-002 Create Ticket：IMPLEMENTATION COMPLETE，INDEPENDENT REVIEW PENDING
- AUR-M8-003 Reply + Close Ticket：NOT STARTED

AUR-M8-002 只增量实现 `POST /api/v1/tickets`。Create 原样提交 strict Public fields、禁止自动 retry，
使用同步锁与 authoritative List recovery；confirmed success 不推断 Ticket ID，UNKNOWN 不推断结果且
再次提交前要求用户核对 List。Reply、Close、attachment、unread、search/filter 及 Referral /
Commission / Withdrawal 均未实现。Production Ticket Read/Create runtime 仍为 NOT TESTED；Milestone 8
保持 CURRENT。
