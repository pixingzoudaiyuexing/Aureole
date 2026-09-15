# Roadmap

| Milestone | Status      | Scope                                                                    |
| --------- | ----------- | ------------------------------------------------------------------------ |
| 0         | COMPLETE    | Product framing and workflow baseline                                    |
| 1         | COMPLETE    | solution Public Contract and upstream architecture baseline              |
| 2         | COMPLETE    | Aureole repository, frontend foundation, app shell, quality and Git SSOT |
| 3         | COMPLETE    | Auth / Account                                                           |
| 4         | COMPLETE    | Read-only Core                                                           |
| 5         | COMPLETE    | Commerce / Payment                                                       |
| 6         | COMPLETE    | Subscription Mutations                                                   |
| 7         | COMPLETE    | Wallet / Gift Card                                                       |
| 8         | COMPLETE    | Support                                                                  |
| 9         | COMPLETE    | Referral / Commission / Withdrawal                                       |
| 10        | IN PROGRESS | Launch Readiness                                                         |

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
- AUR-M9-002 Create Referral Code：COMPLETE，INDEPENDENT REFERRAL CODE MUTATION REVIEW PASS，冻结于
  `ba106d1c7d7b69fbc9b5b52837c3abee939ef218`
- AUR-M9-003 Commission Transfer：COMPLETE，INDEPENDENT FINANCIAL MUTATION REVIEW PASS，PRIMARY FULL-RELOAD
  HARDENING PASS，SAME-RUNTIME FINANCIAL CONCURRENCY HARDENING PASS，CROSS-SESSION FINANCIAL CONTINUATION
  HARDENING PASS，FROZEN at `e408f83311c3557706ac9fc09ac06fe754ea71b8`
- AUR-M9-004 Withdrawal Request：COMPLETE，INDEPENDENT WITHDRAWAL FINANCIAL MUTATION REVIEW PASS，REQUIRED
  FIXES PASS，SAME-RUNTIME FINANCIAL CONCURRENCY HARDENING PASS，CROSS-SESSION FINANCIAL CONTINUATION
  HARDENING PASS，FROZEN at `e408f83311c3557706ac9fc09ac06fe754ea71b8`

AUR-M9-002 只增量实现 bodyless `POST /api/v1/referrals/codes`。Create 使用 fresh Overview authority、
标准 confirmation、同步锁、`retry:false` 和 Overview-only reconciliation；confirmed success 不认领具体 code，
UNKNOWN 不根据 list diff 推断结果。Required fixes 增加 authenticated-session memory uncertainty guard，确保
UNKNOWN 跨 feature remount 保留到明确 acknowledgement，并在 POST 前直接读取 QueryClient current authority
关闭 stale React prop race。

AUR-M9-003 只增量实现 strict `POST /api/v1/referrals/commissions/transfer`。Transfer 使用 canonical Overview、Wallet 与
Account Config 三项 fresh authority、major-to-minor 精确解析、financial confirmation、同步锁和 execution-time
QueryClient recheck。confirmed success 与 definitive failure 只双读 Overview/Wallet；UNKNOWN 使用独立 session-memory
uncertainty marker，双读只恢复当前资金事实，不根据余额 delta 推断 outcome，再次提交需要 acknowledgement、重新输入和
重新确认。Primary required hardening 进一步加入只保存 `active` / `acknowledged` 的 session-scoped safety marker，并在
每次 POST 前同步 pre-arm，关闭 handled UNKNOWN 与 in-flight response 前 full reload 的重复划转窗口；普通同 session reload
保留 marker。Auth boundary 现在保留 active，并把 acknowledged 降级为 active，新 Session 必须重新 acknowledgement。

AUR-M9-004 只增量实现 strict `POST /api/v1/referrals/withdrawal-requests`。Request 仅包含 server-provided exact method 与
raw account，不采集或发送 amount。fresh Withdrawal Options、financial confirmation、execution-time recheck、同步 pre-arm、
独立 reload-persistent uncertainty marker 与 acknowledgement 防止 stale authority 和 UNKNOWN 重复提交；success/definitive
error/UNKNOWN 都只 GET Withdrawal Options 恢复当前 authority，不从 Options、Commission、Wallet 或 Support Ticket 推断上一笔
申请 outcome。Milestone 9 已完成并冻结。Production Referral / Commission / Withdrawal / Create / Transfer runtime 为 NOT TESTED，
属于 Milestone 10 Launch Readiness evidence gap。

Independent Withdrawal review 的 Required Fix 为 shared same-runtime pending gate。Commission 与 Withdrawal 现在分别通过 exact
MutationCache key 阻止 SPA unmount/remount 后仍 pending 的旧 attempt 与新 attempt 重叠；UI 同时隐藏 acknowledgement 和 manual
recovery，执行边界直接 recheck MutationCache。该 same-runtime fact 不替代 sessionStorage 的 full-reload uncertainty marker，且
两个 financial mutation 不互相阻塞。Milestone 9 已完成并冻结；后续生产证据属于已授权但尚未开始的 Milestone 10 Launch Readiness。

后续两个独立 Reviewer 确认 `queryClient.clear()` 不会证明底层 network continuation 已停止。Required Fix 新增 exact-operation
runtime attempt registry 与 authenticated session generation：registry 在同 JS runtime 内跨 logout/query cache clear 保留 pending，
generation mismatch 则禁止旧 Session continuation 清 marker、使用旧 token 对账、污染新 Session canonical cache、退出新 Session 或
显示旧 outcome。logout/new login/Auth invalidation 对 marker 执行 active -> active、acknowledged -> active、absent -> absent；若 logout
后 full reload 导致 registry 消失，persistent active 仍要求 fresh authority 和新 acknowledgement。Milestone 10 IN PROGRESS；
AUR-M10-001 COMPLETE / PRIMARY REVIEW PASS。
AUR-M10-001R1 COMPLETE。
AUR-M10-002 COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT REVIEW PASS / FROZEN。
AUR-M10-002 CODE/CONFIG FREEZE: `8890ba0e8325828e27d2234a3f8b242561fbe801` (Historical pre-independent-review code/config checkpoint `bdaf39f4bbf462ab6729d86b83ea9afbf8421233` remains only as historical evidence)。
Milestone 10 IN PROGRESS。
AUR-M10-003 COMPLETE / PASS
Gate 1: COMPLETE / PASS
Gate 2: COMPLETE / PRIMARY REVIEW PASS / INDEPENDENT SECURITY REVIEW PASS
Gate 3A: COMPLETE / PASS
Gate 3B: COMPLETE / PASS
Gate 3: COMPLETE / PASS
Verified Gate 3 deployment SHA: `1cd18e6a57e775b21d89b951074a44a687ececfc`
Active Cloudflare Pages deployment: `7f379046-49ab-454d-b7ed-dd2ba8abf9df`
Later documentation-only repository commits do not change the deployed application SHA.
Gate 4: COMPLETE / PASS
AUR-M10-004: NOT STARTED / NOT AUTHORIZED
AUR-M10-005: NOT STARTED / NOT AUTHORIZED
AUR-M10-006: NOT STARTED / NOT AUTHORIZED

Milestone 9：COMPLETE / PASS / FROZEN。其代码冻结 SHA 为
`e408f83311c3557706ac9fc09ac06fe754ea71b8`；后续 documentation closure commit 不改变该 code freeze SHA。
Milestone 10：IN PROGRESS。AUR-M10-001 Launch Readiness Evidence Inventory 为
`COMPLETE / PRIMARY REVIEW PASS`，Audit SHA 为
`5b2b994d50e8c2ac599681e1523a4a855054db3c`。完整证据矩阵、安全分类、部署阻塞项和生产验证计划记录于
[`LAUNCH-READINESS.md`](LAUNCH-READINESS.md)。AUR-M10-001R1 只是 Documentation SSOT Reconciliation checkpoint，
不替换原 Audit SHA；本 R1 未访问生产环境、未部署、未执行生产 mutation 或真实资金操作。

审计建议后续按实际依赖顺序拆分：AUR-M10-002 Production Deployment Contract and Artifact Readiness、
AUR-M10-003 Production Auth/Session and Read-Only Verification、AUR-M10-004 Controlled Non-Financial Mutation
Verification、AUR-M10-005 Payment/Wallet/Financial Runtime Verification、AUR-M10-006 Final Browser/Rollback/Launch
Gate。AUR-M10-003 已完成并通过；AUR-M10-004 至 AUR-M10-006 均未启动且未授权，必须等待 Primary
分别审核和授权。
