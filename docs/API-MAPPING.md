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
| Wallet / Gift Card                  | Wallet, deposits, gift card redeem      | 余额只认 Wallet；Deposit/Gift Card 保持显式确认与权威恢复               |
| Notices                             | Notices                                 | 不发明 unread 或 important 状态                                         |
| Support                             | Tickets                                 | message 视为敏感用户内容，不记录 raw payload                            |
| Referrals / Commission / Withdrawal | Referrals and guarded financial actions | 佣金、资格、minimum 与工单状态以上游为权威                              |

## Public onboarding and challenge mapping

- Onboarding requirements 是 TanStack Query server state；Contract 未提供
  `registrationOpen`，前端不得发明或推断。
- 当前支持的 AntiBot capability 只有 `recaptcha` + `v2-checkbox`。未知
  provider/mode 显示 unsupported 并阻止 challenge-required mutation。
- Email code 的 `purpose` 由页面固定为 `register` 或 `password-reset`，不作为用户输入。
- Auth mutation 只发送 provider-neutral `challengeToken`。Password Reset 本身不接受该字段；
  challenge 只用于获取 password-reset email code。
- challenge 获取与验证分别由 Google client和 V2Board 持有；solution Contract 是字段和错误
  SSOT，Aureole 不发送 `recaptchaData`、`recaptchaToken` 或
  `gRecaptchaResponse`。
- Register 成功复用既有 Token -> `/me` -> authenticated Session Core；Password Reset
  payload 只有 email、emailCode、newPassword，成功后不自动登录。
- Email Code、Register、Password Reset mutation 均不自动 retry。含 challengeToken 的请求
  一旦实际发出，无论结果如何都消费并 reset 本地 challenge。

## Account self-service mapping

- `GET /api/v1/me` 继续由 Auth Session Core 持有，Account 页面直接复用其 email、expiresAt
  和 status，不创建第二套 `/me` client 或 query。
- `GET /api/v1/me/preferences`、`GET /api/v1/me/stats` 与
  `GET /api/v1/config/account` 是独立 TanStack Query server state；section failure 不阻塞其他
  Account 功能，但 AUTH_REQUIRED/AUTH_FAILED 会退出完整 authenticated UI。
- `PATCH /api/v1/me/preferences` 只发送实际变化的 boolean 字段，空差异不发请求。mutation
  不 retry，并在成功或结果不确定时重新读取权威 Preferences。
- `POST /api/v1/me/password` 只发送 currentPassword 与 newPassword，其中新密码边界是
  8..1024，不复用 Registration/Reset 的 8..64 schema。成功或结果不确定都会清理本地 session
  并要求重新登录；PASSWORD_CHANGE_FAILED 保留当前 session。
- Account Config 只显示 upstream currency 与 currencySymbol，不推断币种枚举、金额精度或
  minor-unit 换算。Stats 直接显示 Public DTO count，不从其他业务 endpoint 重算。

## Subscription read mapping

- `GET /api/v1/subscription` 只读取 previous-purchaser access eligibility 和 solution-owned
  `accessUrl`。Aureole 不调用、prefetch 或 probe `/api/v1/access/subscription`，不把 credential
  作为链接，也不下载或解析 subscription content。
- `GET /api/v1/subscription/overview` 是 current product、expiry、traffic、device 和 cycle
  config 的权威 read。Dashboard 与 Subscription Page 复用 canonical Overview query；Dashboard
  不创建独立 fetcher。
- Access eligibility 与 Overview current product 是独立语义。`product=null` 不改变
  `eligible/accessUrl`，previous purchaser eligibility 也不证明当前 product 存在。
- Traffic 只做 human-readable byte formatting，不计算 remaining/percentage/over-quota；expiry
  只显示 absolute timestamp 或 neutral null state；device/reset nullable value 不转换为 0 或
  unlimited。
- `renewalAllowed` 只翻译为“新周期功能已启用/未启用”，不作为 mutation eligibility。
- `POST /api/v1/subscription/rotate-access` 是无 body 的非幂等 credential mutation，仅在已有
  Access read 为 eligible 时显示入口，仍由 server 最终判断资格。Mutation 不 retry，并在 success、
  409、明确失败或 UNKNOWN 后重新读取 canonical Access；UNKNOWN recovery 未成功时禁止再次 POST，
  成功后也要求用户确认并保存当前地址再重新确认。
- Rotate success 只接受 `rotated=true` 与安全 HTTPS `accessUrl`，additive fields 会被 strip。
  `accessUrl` 不进入 query key、storage、URL、Zustand、console 或 analytics；Aureole 不 probe、
  fetch 或解析 credential URL。
- `POST /api/v1/subscription/advance-period` 是无 body 的非幂等周期 mutation。入口仅依据
  authoritative Overview 的 `renewalAllowed` 功能开关；当前用户是否满足流量、reset policy 与
  剩余有效期条件仍由 POST 最终判断，前端不计算 remaining traffic、使用百分比、剩余天数或
  `canAdvance`。
- Advance success 只接受 `advanced=true` 并 strip additive fields，随后只重新读取 canonical
  Overview；不本地归零 traffic、不修改 expiresAt/resetDay，也不刷新或伪造 Traffic History。
- `SUBSCRIPTION_PERIOD_ADVANCE_DISABLED`、`SUBSCRIPTION_TRAFFIC_NOT_EXHAUSTED`、
  `SUBSCRIPTION_PERIOD_ADVANCE_UNAVAILABLE` 与 `SUBSCRIPTION_PERIOD_ADVANCE_FAILED` 使用安全本地
  文案并恢复读取 Overview。NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR 与
  MALFORMED_RESPONSE 属于 UNKNOWN；不声明成功或失败、不自动重试，并在再次提交前要求核对状态与
  新的明确确认。
- Advance 与 Rotate 共用 Subscription destructive-action synchronous lock。Advance 的权威读取
  恢复失败时两类 destructive mutation 都 fail closed，直到手动 Overview read 成功；所有 Auth
  failure 仍由 Session Core 清理 credential 与完整 Query cache。

## Catalog, resources and traffic mapping

- `GET /api/v1/products` 是 Plans catalog 的唯一来源。Aureole 保持 Product 与 price order，
  只展示 name、data allowance、speed limit、capacity availability 和 billing prices；不读取
  Product Detail、不结合 current Subscription 过滤、不声明购买资格，也不创建 Order CTA。
- Product price 使用 `amountMinor` 与 canonical `GET /api/v1/config/account` currency metadata。
  Formatter 由平台 Intl currency metadata 决定 standard minor exponent，并以整数/BigInt 拆分，
  不硬编码 `/100`。无法安全识别 currency 时 fail closed，仅显示价格暂不可格式化。
- `GET /api/v1/resources` 只映射 Public id/name/category/status。Resource UI 不显示或推断 host、
  IP、port、credential、UUID、SNI、path、protocol config 或 raw V2Board server object。
- `GET /api/v1/traffic/logs` 仅在 Subscription Page 展示 ordered compact list。uploadedBytes 与
  downloadedBytes 复用 canonical byte formatter，recordedAt 显示 absolute local time，
  rateMultiplier 仅作为 metadata；不聚合、不计费、不排序、不分页、不轮询。
- Products、Resources、Traffic 均使用 protected authenticatedRequest 和独立 server-state query。
  普通 failure 局部 Retry；AUTH_REQUIRED/AUTH_FAILED 清除完整 authenticated state。

## Notices mapping

- `GET /api/v1/notices?page={page}&pageSize=20` 是 `/notices` 的唯一列表来源。Aureole 使用
  credential-free `['notices', 'list', page, 20]` query key，保持 server order，并仅展示 Public
  Summary 的 title、tags 与 absolute createdAt；分页只依据响应 page/pageSize/total。
- `GET /api/v1/notices/{id}` 只在用户明确选择公告后请求，并使用
  `['notices', 'detail', id]`。`NOTICE_NOT_FOUND` 只关闭在 Detail 错误边界内，不退出 Session；
  普通 read error 可重试且不清除 Notice List。
- Detail `content` 在 API boundary 保持经过类型与长度验证的 opaque HTML string，只能通过
  `SafeNoticeHtml` 使用 DOMPurify 窄 allowlist 展示。Title 与 tags 仍由 React text escaping
  处理；正文不得进入 storage、Zustand、URL、日志或其他 raw HTML sink。
- Dashboard 的“最新公告”复用同一 List boundary 请求 page 1 / pageSize 1，并展示服务端返回的
  第一条 Summary。它不请求 Detail、不解析 HTML、不根据 timestamp 重排，也不发明 unread 或
  important 状态。

## Orders read mapping

- `GET /api/v1/orders` 是 `/orders` 的唯一 List 来源。Aureole 保持 server order，只展示 id、
  status、amountMinor 和 Contract timestamps；不把订单连接到 Product catalog，也不推断订单
  类型、套餐、billing period、payment method、promotion 或 callback。
- `GET /api/v1/orders/{id}` 只在用户选择订单后请求；id 作为符合
  `^[A-Za-z0-9_-]{1,36}$` 的 opaque Public identifier 处理。`ORDER_NOT_FOUND` 保留 List 和
  Session，`ORDER_QUERY_FAILED` 及其他 ordinary read error 提供局部 Retry。
- amountMinor 与 canonical `GET /api/v1/config/account` 组合，并复用 `formatMinorMoney`。Config
  ordinary failure 或 unsupported currency 只显示“金额暂无法安全格式化”，不猜测币种、金额
  exponent 或 `/100`。
- pending、processing、cancelled、completed、adjusted 分别使用冻结的用户语义；nullable
  updatedAt/expiresAt 不转换为本地 derived expiry。

## Commerce mutation mapping

- `GET /api/v1/products/{id}` 在用户从 Plans 明确选择创建订单后按需读取。Product Detail 是 Create
  Dialog 的套餐名称、规格和周期标价来源，但 `POST /api/v1/orders` 仍是购买/续费资格及最终金额权威。
- `POST /api/v1/promotions/validate` 只在用户点击“验证优惠码”时调用。Aureole 只显示 Contract 返回的
  fixed amount 或 percentage preview，不计算折后价；输入变化会清除旧结果，Create 会再次由上游最终
  验证 promotionCode。
- `POST /api/v1/orders` 只发送 productId、billingPeriod 和可选 promotionCode，不发送价格、余额、
  payment method 或 V2Board 字段。Mutation 不自动 retry，并通过同步锁防重复提交。结果未知时先 GET
  Orders List，并要求用户确认已核对列表后才能再次 POST；成功后同样刷新 List，并只显示返回的 ID。
- `POST /api/v1/orders/{id}/cancel` 只从 pending Detail 提供入口，但是否可取消仍由服务端决定。操作需
  明确二次确认且不自动 retry；成功、不可取消和未知结果读取 Detail/List，ORDER_NOT_FOUND 读取 List，
  明确失败至少读取 Detail。恢复失败时不重新开放 Cancel。
- 所有新增 API request/response 都经过 strict request schema 与 strip-additive response parser。
  AUTH_REQUIRED/AUTH_FAILED 在 Product、Promotion、Create、Cancel 或恢复读取任一边界都会退出完整
  authenticated state。

## Payment mapping

- `GET /api/v1/billing/methods` 只在用户从 pending Order Detail 点击“支付订单”后读取，使用
  `['billing', 'methods']` query。UI 只显示 id 对应的 name、optional HTTPS icon 与 fee metadata；
  icon 失败使用本地 fallback，不阻止选择支付方式。
- fixedMinor 只通过 canonical Account Config 与 `formatMinorMoney` 展示，percent 只作为原始 metadata
  展示。Aureole 不计算 percentage fee、order + fee、折扣 + fee 或任何最终应付金额。
- `POST /api/v1/orders/{id}/checkout` 的 strict body 只有 paymentMethodId。Mutation 明确不 retry，并以
  同步锁阻止 same-tick 双击；Checkout pending 时不能 Cancel，Cancel pending 时不能 Checkout。
- `finished` 只触发权威状态读取。`qrcode.data` 作为 transient opaque content 在当前组件内本地生成
  QR，不 fetch、解析、打开、上传或持久化。`redirect.target` 不显示、不修改、不 iframe，只在用户明确
  点击“前往支付”后以当前 tab 导航。
- `GET /api/v1/orders/{id}/status` 使用 `['orders', 'status', id]`，只在明确 Payment Flow 内轮询。
  pending 约每 3 秒读取一次，非 pending、关闭 UI、route unmount、Auth failure 或约 5 分钟 hard cap
  时停止；状态变化刷新 Detail/List，hard cap 后提供手动刷新。
- Checkout 的 NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR 与 MALFORMED_RESPONSE 均视为
  UNKNOWN：POST 不重试，立即读取 Status/Detail/List；状态仍 pending 时，用户必须确认已核对订单状态
  才能再次提交。PAYMENT_METHOD_UNAVAILABLE、ORDER_EXPIRED、PAYMENT_CREATE_FAILED 与
  VALIDATION_ERROR 按 Contract 分别恢复所需权威 read，不触发 logout 或自动 POST。
- Payment Methods、Checkout、Status、Detail 或 List 任一边界返回 AUTH_REQUIRED/AUTH_FAILED 时，
  继续复用 sealed Auth Session Core 清理 credential 与完整 Query cache。

## Wallet balance, deposit and Gift Card mapping

- `GET /api/v1/wallet` 是 `/wallet` 唯一余额来源，使用 credential-free canonical `['wallet']`
  query。Public DTO 只接受 `balanceMinor` 为 `0..2147483647` 整数并 strip additive fields；负数、
  浮点、numeric string、null、缺失或超出上限均 fail closed 为 MALFORMED_RESPONSE。
- Wallet 不从 Orders、Commission、pending Deposit 或其他数据计算、累加或推断余额，不建立 ledger、
  transaction history、snapshot 或 persistent cache。
- `balanceMinor` 只与 canonical `GET /api/v1/config/account` 组合并复用 `formatMinorMoney`；不硬编码
  币种、symbol、两位小数或 `/100`。Config 未知或无效时不伪装金额，并提供独立 Retry。
- Wallet 普通 read error 只影响余额 section；Wallet 或 Account Config 的
  AUTH_REQUIRED/AUTH_FAILED 均复用 sealed Session Core 清除 credential 与完整 Query cache。
- `POST /api/v1/wallet/deposits` 的 strict request 只包含 `amountMinor`，范围为 `1..2147483647`；
  success 只接受并 strip 为复用 `orderIdSchema` 的 `{ id }`。`['wallet', 'deposit-create']` mutation key
  不包含 token、金额、订单号或余额，mutation 显式 `retry: false`。
- 人类金额输入使用 Account Config currency 的 Intl canonical fraction digits，以 string/BigInt 转换；
  不使用 `parseFloat`、`Number * 100`、`Math.round`、固定两位小数或前端业务限额。
- 用户第一次点击只打开确认 Dialog。确认 POST 使用同步 action lock；pending 锁定输入与 Dialog action。
  成功后只重新读取 canonical Orders List、显示临时 created Order ID 并导航 `/orders`，不本地修改或刷新
  Wallet balance，也不自动读取 Payment Methods、Checkout 或 Order Status。
- `WALLET_DEPOSIT_UNAVAILABLE` 重新读取 Orders 并引导用户检查；
  `WALLET_DEPOSIT_AMOUNT_INVALID` 保留可编辑金额；`WALLET_DEPOSIT_CREATE_FAILED` 不声明成功。三者均不
  logout、不自动 POST retry，用户再次提交仍需新的金额确认。
- NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR 与 MALFORMED_RESPONSE 保持 UNKNOWN，并立即
  GET Orders。List 只能供用户核对，不按 amount、createdAt、新 ID 或 list diff 自动推断本次 Deposit
  outcome。读取失败时禁止第二次 POST；读取成功后仍需专用 acknowledgement 和标准金额确认。
- Deposit POST、Orders recovery、Wallet read 或 Account Config read 的 AUTH_REQUIRED/AUTH_FAILED 均
  复用 sealed Session Core。金额文本、created Order ID、feedback 与 recovery guard 只在 React local
  state，不进入 URL、storage、Zustand、console 或 analytics。
- `POST /api/v1/gift-cards/redeem` 的 strict request 只包含原样 `code`，长度为 `1..255`；不 trim、
  normalize 或发送 V2Board `giftcard` alias。`['gift-cards', 'redeem']` mutation key 不包含 code、token、
  effect 或账户字段，并显式 `retry: false`。
- Success 只接受 `redeemed: true` 与 balance、validity、traffic、trafficReset、plan discriminated
  effect；所有数值严格为 signed INT，plan 的 `0` 和 `null` 保持不同语义。Additive fields strip，unknown
  type、raw numeric type、float、numeric string、缺失或越界均 fail closed 为 MALFORMED_RESPONSE。
- Code input 默认 password，可显式 show/hide；第一次点击只打开 masked confirmation，acknowledgement
  后才能 POST。成功清空 code/reveal，并原样展示 server effect；不计算新余额、expiresAt、traffic、
  reset day、plan name 或 plan ID。
- Confirmed success 与 UNKNOWN 都重新读取 canonical Wallet、Me、Subscription Overview，并以
  `refetchType: none` invalidate Subscription Access。Wallet 页面不主动读取 accessUrl，也不 fetch
  subscription content。成功 recovery 失败仍声明兑换成功但禁止再次兑换；UNKNOWN recovery 不根据
  账户变化推断因果，全部 authority 恢复后仍需专用 acknowledgement 与新的标准确认。
- GIFT_CARD_NOT_FOUND、NOT_ACTIVE、EXPIRED、USAGE_LIMIT_REACHED、ALREADY_REDEEMED、NOT_APPLICABLE、
  REDEEM_FAILED 与 VALIDATION_ERROR 使用本地安全文案，不自动 retry、不 logout、不暴露 upstream raw
  message。UNKNOWN 后再次得到 ALREADY_REDEEMED 只陈述当前事实，不推断上一次请求成功。
- Deposit 与 Gift Card 共用页面级同步 Wallet action coordinator；两类 mutation pending 时互相禁用，
  same-tick 只能有一个金融 POST。Gift Card code、masked value、effect、feedback 与 guard 不进入 URL、
  storage、Zustand、Query key、console、analytics 或 error metadata。
- AUR-M7-003 不实现 Gift Card list/history/preview、ledger、pending balance、bonus/fee、callback、第二套
  Payment flow、Support、Referral、Commission、Withdrawal 或 Launch Readiness。

## Support Ticket read mapping

- `GET /api/v1/tickets` 是 `/support` 的唯一 List 来源，使用 credential-free canonical
  `['tickets']` query。Aureole 只接受 `{ tickets: TicketSummary[] }`，strip additive/V2Board 字段，
  保持 server order，不推导 unread、waiting state、SLA、priority sort 或 open-first sort。
- `GET /api/v1/tickets/{id}` 只在用户明确选择 Ticket 后读取，并使用
  `['tickets', 'detail', id]` canonical cache。ID 必须是 `1..2147483647` 的十进制正整数字符串；非法
  本地 ID 不发 HTTP request。Message 保持 server order，sender 只依据 Public `fromMe` 显示为“我”或
  “客服”，不推断 staff/admin identity。
- Ticket `subject` 与 Message `content` 只作为 React text node 展示，不解释 HTML/Markdown，不创建
  unsafe link，不使用 `dangerouslySetInnerHTML` 或 sanitizer。换行使用 `white-space: pre-wrap` 保留，
  长文本允许安全断行。
- List ordinary error 提供局部 Retry；Detail ordinary error 与 `TICKET_NOT_FOUND` 不清除或修改 List。
  两个 GET 的 AUTH_REQUIRED/AUTH_FAILED 均复用 sealed Session Core 清理 credential 与完整 Query cache。
- Ticket 内容不进入 storage、URL、Zustand、analytics、console 或 Query key。本阶段不调用
  reply/close route，也不实现 attachment、search/filter、unread/counter 或 Referral / Commission /
  Withdrawal。
- `POST /api/v1/tickets` 只接受并原样发送 strict `{ subject, priority, message }`；subject/message
  仅做 1..255 / 1..10000 structural validation，不 trim、normalize、sanitize 或转换换行。Aureole
  不发送 `level`、status、identity、timestamp 或其他字段，也不复制 V2Board create eligibility。
- Create 使用 content/credential-free `['tickets', 'create']` mutation key、`retry: false` 和同步锁。
  打开/填写/取消 Dialog 都不发 POST；只有显式“提交工单”会 POST，pending 时全部 form control 锁定。
- Success 只接受 `{ created: true }`，清空 form 后重新读取 canonical `['tickets']`。Public success
  没有 Ticket ID；Aureole 不按 List diff、subject/message、timestamp、priority、最高 ID 或首末行推断、
  选择或打开所谓新 Ticket，也不自动请求 Detail。
- Confirmed success、`TICKET_UNAVAILABLE` 与 UNKNOWN 后的 List reconciliation 都只发 GET。
  Success reconciliation failure 保持 Create success，但 fail closed；`TICKET_UNAVAILABLE` 使用泛化
  文案。`TICKET_CREATE_FAILED` / `VALIDATION_ERROR` 保留表单并要求新的显式提交。
- NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、MALFORMED_RESPONSE 与 non-ApiError 均视为
  UNKNOWN。List recovery 成功不改变 UNKNOWN outcome；再次 Create 前需专用 acknowledgement，修改
  payload 会清除 acknowledgement。Recovery 失败只允许手动 List GET，任何 recovery Auth failure
  进入 sealed Session Core。
- Independent Review required fix 将 Create 额外 gate 在 canonical List 当前 authority 上：必须同时满足
  List `isSuccess` 且 `!isFetching`。初始 loading/error、Retry/refetch in-flight、cached stale List 的 fresh
  refetch、以及 UNKNOWN/confirmed-success/TICKET_UNAVAILABLE recovery failure 后的 remount 都不能 POST。
  当前页面成功完成 List GET 后才重新开放 Create；现有 local UNKNOWN acknowledgement、same-tick lock、
  `retry:false` 与 recovery fail-closed 继续保留，不使用 storage/URL/Zustand 持久化 guard。
- AUR-M8-002 已通过 Independent Create Ticket Mutation Review。
- `POST /api/v1/tickets/{id}/reply` 复用 canonical Ticket ID schema，只原样发送 strict `{ message }`；
  `POST /api/v1/tickets/{id}/close` 不发送业务 body。Reply/Close success 分别只接受 literal
  `{ replied: true }` / `{ closed: true }` 并 strip additive fields；malformed success 统一为
  `MALFORMED_RESPONSE`。Mutation key 是 content/credential/ID-free 的 `['tickets','reply']` 与
  `['tickets','close']`，均为 `retry:false`。
- Reply/Close 只在 selected canonical Detail `isSuccess && !isFetching`、query fetch idle、Detail ID
  与 selection 一致且 status 为 `open` 时可执行。Reply 还遵循 V2Board 的消息交替规则：authoritative
  `messages` 必须非空，并以最大数值 TicketMessage ID 确定 V2Board-authoritative latest message；该消息
  `fromMe === false` 时才允许 Reply。数组尾不保证是 latest message。用户拥有最大 message ID 时显示正常
  等待状态，空消息历史 fail closed。Close 仍只要求 authoritative open Ticket，不受 Reply 轮次限制。
- Reply/Close authority 在渲染和最终 mutation execution boundary 两层检查；Reply 最终边界会重新读取
  exact canonical Detail cache，并以同一最大数值 message ID 规则核对 sender，防止无序数组、后台 refetch
  与 stale form submit 绕过 UI。
  initial/error/cached-refetch/fresh-refetch-failure/remount 都 fail closed。两个动作共享同步锁，最多一个
  same-tick POST；closed Detail 不提供 mutation 或 Reopen。
- Reply success 清空 textarea，Close success 关闭 confirmation；两者随后只通过 GET Detail/List 对账，
  不 append message、生成 ID/time、改 status/updatedAt 或调用 `setQueryData`。Detail reconciliation
  failure 保留 confirmed success 并只开放 GET-only recovery；List failure 由 canonical List gate 继续
  约束 Create。成功 Reply 的 authoritative Detail 若返回新的最大 message ID 且 `fromMe === true`，UI
  自动回到等待客服状态，不能连续发送第二条 Reply；不按数组位置或本地 POST 事实推断。
- `TICKET_REPLY_FAILED` / `TICKET_CLOSE_FAILED` 使用泛化文案并重新读取 Detail；`TICKET_NOT_FOUND`
  重新读取 List 且不本地删 row；Reply `VALIDATION_ERROR` 保留可编辑原文。所有边界的 Auth error 复用
  sealed Session Core。AUR-M10-004 runtime 观察到的新建 Ticket 立即 Reply 返回 409，是 V2Board
  拒绝用户连续消息的正常业务规则；Solution 将该状态映射为 `TICKET_REPLY_FAILED`，不需要 Contract 变化。
- Reply/Close 的 NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、MALFORMED_RESPONSE 与
  non-ApiError 都是 UNKNOWN。Detail recovery 后只展示当前 open/closed 事实，不按 message 内容、数量、
  ID、createdAt 或 status 做因果推断；再次执行相同 mutation 前需专用 acknowledgement，Close 还需
  authoritative open 状态与标准 confirmation，Reply 还需 authoritative non-empty messages 且最大数值
  message ID 属于客服。Reply payload change 清除 acknowledgement；recovery failure 只允许 GET。
- Reply message 仅在 form/active mutation memory 中存在，保持空格、换行与 HTML-like 文本原样；不进入
  storage、URL、Zustand、analytics、console、error metadata、Query/Mutation key。Detail 消息继续作为
  plain React text node 展示。

## Referral and commission read mapping

- `GET /api/v1/referrals` 是推荐概览与邀请码的唯一来源，使用 credential-free canonical
  `['referrals','overview']`。Aureole 只接受 ordered `codes` 与 Public 五项 stats，strip additive/private
  fields，不排序、去重、生成 code，也不构造 Contract 未定义的 referral URL 或 QR。
- Code 严格消费 solution normalized 1..32 ASCII alphanumeric 与 ISO createdAt。用户可明确点击复制原始
  code；页面不会自动写 clipboard，也不把 code、commission history 或其他账户私有数据写入 storage、
  URL、Zustand、analytics、console 或 Query key。
- `GET /api/v1/referrals/commissions?page={page}&pageSize=20` 使用
  `['referrals','commissions',page,20]`。Aureole 保持 server item order，只展示 orderAmountMinor、
  commissionAmountMinor 与 absolute createdAt；不推导 Order ID、购买用户、Product、Plan、Payment 或
  commission status。Previous/Next 只依据 Public page/pageSize/total，page 是 React local state。
- `GET /api/v1/referrals/withdrawal-options` 使用
  `['referrals','withdrawal-options']`，保持 methods order。disabled 时只显示当前未开放；enabled 且空
  methods 时明确显示当前没有方式。Frontend 不翻译 method identifier，也不猜测 fee、minimum、limit、
  processing time。只有 fresh success、idle、enabled 且 methods 非空时才创建 Withdrawal Request form。
- Referral 与 Commission money 是 non-negative safe integer minor units，复用 canonical Account Config 和
  `formatMinorMoney`，不硬编码 currency/symbol/fraction digits 或 `/100`。Config 不可用时 Referral data
  保持可见并显示明确 minor-unit fallback。`availableCommissionMinor` 不合并、累加或复制到 Wallet。
- Overview、History、Withdrawal Options 与 Config ordinary failure 各自隔离并可 Retry；任一 GET 的
  AUTH_REQUIRED/AUTH_FAILED 都复用 sealed Session Core 清理 credential 与完整 Query cache。
- `POST /api/v1/referrals/codes` 是唯一 Create Code 写边界。请求没有 body 或人为 JSON Content-Type；成功只
  接受并 strip `{created:true}`，`created:false`、缺失、错误类型或 raw V2Board `data:true` 均为
  `MALFORMED_RESPONSE`。Mutation 使用 `['referrals','create-code']`、`retry:false` 与同步锁。
- Create 由 fresh `['referrals','overview']` authority、标准 confirmation 和最终 QueryClient execution recheck
  三层约束。执行层在同步锁后立即要求 Overview query `status=success`、`fetchStatus=idle` 且 data 存在；不只
  信任可能尚未 commit 的 React prop，也不只检查 cached data。
- success、`REFERRAL_CODE_LIMIT_REACHED`、UNKNOWN 均只 GET Overview 对账，不刷新 Commission、Withdrawal 或
  Wallet，也不本地修改 code list。成功只说明服务端确认创建；UNKNOWN 即使 Overview 出现新 code 也不推断
  因果。对账失败 fail closed；UNKNOWN 对账成功后需要先核对 acknowledgement，再重新打开 confirmation。
- `['referrals','create-code-uncertainty']` 是 session-memory local mutation-safety guard，不是 Public/server Query。
  它只保存 `active` / `acknowledged` / null，使用 `gcTime:Infinity` 跨 Referral unmount/remount；fresh GET 不会
  清除 `active`。明确 acknowledgement 可解除，取消勾选恢复 `active`，Session Core `queryClient.clear()` 会
  清除 marker。
- Create/recovery 的 AUTH_REQUIRED/AUTH_FAILED 复用 sealed Session Core。Code list、token、email、amount、
  timestamp 与 upstream message 不进入 local guard；marker 不进入 storage、URL、Zustand、analytics 或 console。
- `POST /api/v1/referrals/commissions/transfer` 只发送 strict `{amountMinor}`，范围为 1..2147483647 integer；成功只接受
  `{transferred:true}` 并 strip additions。`transferred:false`、缺失、wrong type 或 raw V2Board `data:true` 都是
  `MALFORMED_RESPONSE`。Mutation 使用 `['referrals','commission-transfer']` 与 `retry:false`。
- Transfer 输入复用 Account Config、`parseMoneyInputToMinor` 与 `formatMinorMoney`。Overview、Wallet、Config 必须 fresh
  success 且 idle，session safety storage 必须可读；POST 前在同步锁后从 QueryClient 重新检查三项 current authority、
  currency snapshot、uncertainty marker 与 `amountMinor <= availableCommissionMinor`，不只信任 React render state。
- 每次真实 Transfer POST 前先同步写入
  `sessionStorage['aureole.safety.commission-transfer-uncertainty']='active'`，再同步更新 QueryClient marker，随后无 await
  调用 mutation。持久写入失败时不发送 POST。pending、runtime replacement 与 response 前 full reload 都由预先持久化的
  `active` 保护。
- confirmed success 与 definitive rejection 都 exact refetch Overview + Wallet；不 broad invalidate `['referrals']`，不刷新
  Commission History、Withdrawal Options、Orders 或 Subscription，也不本地加减余额。成功对账部分失败保留 confirmed
  success 但 fail closed，只开放 GET-only 双读恢复。
- NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、MALFORMED_RESPONSE 与 non-ApiError 是 UNKNOWN。QueryClient local
  marker 与 session-scoped persistent marker 都保持 `active`；recovered delta 匹配或不变都不证明 outcome。双读恢复后
  仍需明确 acknowledgement、重新输入和 financial confirmation；ack/uncheck 同步持久化 `acknowledged` / `active`，
  下一次 POST 前再次 pre-arm。
- Persistent marker 只允许 `active` / `acknowledged` / absent，不包含 amount、balance、currency、credential、identity、
  timestamp 或 error。首次 render 同步 hydrate；普通 auth reload 保留它，confirmed success 与 definitive rejection 清除，
  不使用 localStorage，M9-002 Create Code guard 仍不持久化。Authenticated Session boundary 对 financial marker 的处理固定为：
  `active -> active`、`acknowledged -> active`、`absent -> absent`。未决 non-idempotent financial outcome 不得通过 logout 或
  new login 绕过；`queryClient.clear()` 只清理 Query cache，不代表底层 financial continuation 已停止。
- Transfer/financial recovery 的 AUTH_REQUIRED/AUTH_FAILED 复用 sealed Session Core。金额、余额、币种快照、token、email
  与 raw upstream message 不进入 Query/Mutation key、local guard、storage、URL、Zustand、analytics 或 console。
- AUR-M9-003 已通过 Independent Financial Mutation Review 与 Primary Hardening Review，并冻结于
  `e408f83311c3557706ac9fc09ac06fe754ea71b8`。`e8e83622abf38960ed41fd222a978f02323592df` 仅保留为 historical
  intermediate review SHA，不是最终 code freeze。
- `POST /api/v1/referrals/withdrawal-requests` 只发送 strict `{method,account}`。method 1..255、account
  1..1024，均保持 raw string；额外字段在 request boundary 被拒绝。成功只接受并 strip
  `{requested:true}`，false、缺失、wrong type 或 raw V2Board `data:true` 均为 `MALFORMED_RESPONSE`。
- Public Contract 没有 withdrawal amount。Aureole 不提供 amount/全部提现输入，不发送金额，不依据
  `availableCommissionMinor` 计算申请金额、minimum、差额、手续费、剩余佣金或到账结果。
- method 只能从当前 canonical Options 的 ordered `methods[]` exact 选择；不排序、去重、翻译、映射品牌或新增
  identifier。account 默认遮蔽，保持大小写、首尾空格和全部字符原样，不 trim、normalize、parse、split 或格式化。
- Mutation 使用 credential/method/account-free `['referrals','withdrawal-request']` 与 `retry:false`。第一次点击只打开
  Financial Confirmation；Dialog snapshot 仅存在于 React memory，account 默认 masked，并明确 request accepted 不等于
  payout completed。
- Confirm 同步获取 action lock 后，从 QueryClient 重新要求 Options query `status=success`、`fetchStatus=idle`、data
  存在、enabled、methods 非空且 snapshot method 仍 exact supported；同时重新验证 account 1..1024 与独立 uncertainty
  state。任何检查失败均零 POST，并要求 fresh authority 下重新确认。
- 每次真实 POST 前同步写入
  `sessionStorage['aureole.safety.withdrawal-request-uncertainty']='active'`，再同步更新
  `['referrals','withdrawal-request-uncertainty']`，随后无 await 调用 mutation。storage read/write failure fail closed。
- confirmed `{requested:true}` 与五类 definitive rejection 都清除 Withdrawal marker 和敏感 account，只 exact refetch
  Withdrawal Options；不 broad invalidate `['referrals']`，不刷新 Overview、Commission History、Wallet、Orders、
  Subscription 或 Support Tickets。Options reconciliation failure 保留已确认结论但禁止下一笔 POST。
- `WITHDRAWAL_DISABLED`、`WITHDRAWAL_METHOD_UNSUPPORTED`、`WITHDRAWAL_MINIMUM_NOT_MET`、
  `WITHDRAWAL_REQUEST_FAILED` 与 `VALIDATION_ERROR` 是 definitive rejection；前端只显示稳定安全文案，不显示 raw
  upstream message、minimum 数值或内部 Ticket 实现。
- NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、MALFORMED_RESPONSE、未知 Public error 与 non-ApiError 是
  UNKNOWN。Options GET 无法证明上一笔申请 outcome；enabled/method 变化、Overview/Commission/Wallet/Order/Ticket
  变化同样不具有因果意义。marker 保持 active，用户 fresh Options 后明确 acknowledgement 才能重新开始完整流程。
- Withdrawal account 在 success、definitive rejection、UNKNOWN 与 Auth invalidation 后清空，并在 settle 后从 Mutation
  cache 移除；不进入 Query/Mutation key、sessionStorage、localStorage、IndexedDB、URL、Zustand、analytics、console、
  error metadata 或文档真实示例。
- Withdrawal 与 Commission Transfer persistent marker 完全独立；普通 credential hydrate 保留，Authenticated Session boundary
  仍执行 `active -> active`、`acknowledged -> active`、`absent -> absent`。AUR-M9-004 不修改 solution、不直接访问 V2Board，
  也不查询 Support Tickets 进行结果推断。
- M9-003/M9-004 的最终 safety boundary 还包括 QueryClient exact MutationCache pending gate、QueryClient-independent runtime
  financial attempt registry 和 in-memory authenticated session generation。stale Session continuation 不得清除 new-session
  marker、使用 old token 对账、污染 new-session canonical cache、logout new Session 或暴露 old outcome feedback。

## Error and request rules

- 业务分支依据稳定 `error.code`，禁止依据 message 文本包含关系。
- 保留 HTTP status 与 requestId，向用户提供可理解的恢复路径。
- malformed JSON/envelope、network failure 与 public error 分开处理。
- Mutation 默认不 retry；非幂等操作 timeout 后先刷新权威读取接口。
- API origin 来自 `VITE_API_BASE_URL`；请求路径必须属于 `/api/v1`。
- 不发送或记录 V2Board Secret、raw DTO、Authorization Header 或完整敏感 payload。
