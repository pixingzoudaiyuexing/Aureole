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
  `POST /api/v1/tickets`、reply/close route，也不实现 attachment、search/filter、unread/counter 或
  Referral / Commission / Withdrawal。

## Error and request rules

- 业务分支依据稳定 `error.code`，禁止依据 message 文本包含关系。
- 保留 HTTP status 与 requestId，向用户提供可理解的恢复路径。
- malformed JSON/envelope、network failure 与 public error 分开处理。
- Mutation 默认不 retry；非幂等操作 timeout 后先刷新权威读取接口。
- API origin 来自 `VITE_API_BASE_URL`；请求路径必须属于 `/api/v1`。
- 不发送或记录 V2Board Secret、raw DTO、Authorization Header 或完整敏感 payload。
