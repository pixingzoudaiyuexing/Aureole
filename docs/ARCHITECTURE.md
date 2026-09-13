# Architecture

## Runtime

Aureole 是 React + TypeScript + Vite 静态 SPA。UI 使用 Tailwind CSS v4、CSS Variables、semantic tokens 与最小 shadcn/ui primitives。路由使用 TanStack Router file-based routing，server state 使用 TanStack Query。

React Hook Form + Zod 是后续表单边界；Zustand 只预留给 Auth 或少量 client state，不存 server state。当前 Foundation 不创建假 store 或假表单。

## Frontend references

### satnaing/shadcn-admin

`satnaing/shadcn-admin` 是 Aureole 的工程与结构参考，用于 App Shell、Sidebar、Header、responsive layout、table/form/dialog/sheet 等常见交互原语，以及 feature-oriented project organization。

规则是：**Reference structure, do not clone product.** Aureole 不直接复制模板，不继承 Clerk、demo Dashboard、Analytics、Tasks、Users 或其他 demo feature，也不因参考项目使用某个 package 就自动继承该依赖。更换 logo 或品牌名称不构成 Aureole 产品实现；App Shell、业务结构、组件与视觉身份必须由 Aureole 自己持有。

### Cult UI

Cult UI 仅是可选的 visual enhancement layer 和 micro-interaction 参考，不是第二套 Foundation，也不属于应用架构。只在具有明确 UX 收益时选择性采用，优先封装在 Aureole-owned component 后面。

核心 component、navigation、business flow 和 feature boundary 不得依赖 Cult UI。移除任何 Cult UI-derived enhancement 都不得破坏核心业务结构。首阶段主要限于 Copy -> Check feedback、Dialog/Sheet transition 和 loading feedback；不得因此引入 large animation runtime、heavy decorative effect 或显著增加 initial load 的依赖。

## Source boundaries

```text
src/
  app/          router, providers, bootstrap composition
  components/   ui primitives, layout, shared presentation
  config/       stable frontend configuration
  features/     feature-owned UI and future queries/forms
  lib/          API, auth, formatting, validation, security boundaries
  routes/       thin TanStack route entries
  styles/       tokens and global CSS
  test/         shared setup and foundation tests
```

业务逻辑归属 `features/<domain>`。Route 负责导航和组合，不成为业务实现目录；共享组件必须有真实跨 feature 用途。

## Provider composition

`AppProviders` 依次组合 Theme、QueryClient、Tooltip 和 Router。每个 Provider 职责单一。Query 最多对 transient error retry 一次，mutation 永不全局自动 retry。

## Routing and code splitting

`_public` 提供 `/login`、`/register`、`/forgot-password`。`_app` 在统一 route group boundary 执行真实 Auth Guard：bootstrap 未完成时只显示安全 loading，未认证时 redirect `/login`，认证成功后才渲染 App Shell。`/` 根据同一 Auth State 决定 `/login` 或 `/dashboard`；已认证用户访问 public Auth route 会返回 `/dashboard`。

当前 guard 在 route component 边界阻止受保护 UI render。未来引入 protected TanStack Router loader 前必须重新评估 guard/loading 架构；Auth 未解析完成时，loader 不得提前发起 authenticated business fetch。

TanStack Router 插件启用 route-level auto code splitting；生成的 `src/routeTree.gen.ts` 提交到 Git，业务 route 产出独立 lazy chunk。

## API client

`src/lib/api` 使用 native `fetch` typed wrapper，集中处理 base URL、JSON、public envelope、HTTP status、requestId、network error 与 malformed response。路径必须以 `/api/v1/` 开头。业务分类只能依据 `ApiError.code`，禁止 `message.includes(...)`。

`VITE_API_BASE_URL` 是公开 solution Origin，不是 Secret。Auth session 只在 memory + `sessionStorage` 保存 opaque bearer，不解析、不写入 `localStorage`，也不持久化 Query cache。API Client 只通过显式 authenticated request boundary 添加 `Authorization: Bearer <opaque-token>`，并拒绝调用方手工注入 Authorization header。

`sessionStorage` 是正常的 tab-session persistence。如果浏览器因 privacy/security/quota 限制拒绝写入，登录可降级为当前 document lifetime 内的 memory-only session；页面刷新后无法恢复时按 unauthenticated 处理，禁止降级到 `localStorage`、IndexedDB、cookie 或 URL。

`features/auth` 独占 Login、session bootstrap 和 `/me` query 的前端 ownership。Zustand 只保存 access token 与 hydration 状态；`/me` DTO 只存在于 TanStack Query server state，不复制进 Zustand。Login mutation 明确不 retry，收到 token 后必须完成 `/me` bootstrap 才建立 authenticated UI。

Auth response parser 对 solution 的 additive unknown fields 保持兼容，同时 strip 未知字段，只把 Aureole 当前认识且已强校验的白名单字段交给应用层。Login 等 request schema 不因此放宽。

`AUTH_REQUIRED` / `AUTH_FAILED` 证明 credential 无效时，前端清除 memory、sessionStorage 和完整 Query cache 并回到 Login。`NETWORK_ERROR`、`UPSTREAM_ERROR`、`UPSTREAM_TIMEOUT` 不证明 credential 无效：保留 token，隐藏受保护 UI，并提供重试或 local logout。由于 solution 没有 Public logout endpoint，当前 Logout 只清理本地 credential 与 Query cache，不声明服务器撤销。

## Public onboarding and challenge

Active onboarding Contract baseline 是 solution
`0a37894173d1db0bbc57576c640652878f8f623d`。Onboarding config 属于 TanStack
Query server state，不进入 Zustand 或持久化缓存；requirements 未知时 Registration
与 Recovery fail closed，不猜测 registration availability。

P-09 当前只支持 `antiBot.provider="recaptcha"` 与
`antiBot.mode="v2-checkbox"`，对应 Google reCAPTCHA v2 visible checkbox / explicit
render。Mutation 始终只向 solution 发送 provider-neutral `challengeToken`，由 V2Board
权威验证；Aureole 不持有 secret、不验证 challenge、不发送 provider-specific 字段。
未知 provider/mode 必须分类为 unsupported 并 fail closed，不能静默降级为未启用。

Challenge token 是单次、短期、敏感的局部 form-flow state。它不得进入 Zustand、Query
metadata、storage、URL、日志或 analytics；任何实际发送了 challengeToken 的 mutation
attempt 都视为已消费，settle 后必须清除 token 并 reset widget。

`features/auth` 以一个 Public Account API boundary 实现 Onboarding、Email Code、Register
与 Password Reset。Response parser 强校验已知字段并 strip additive unknown fields；
request builder 使用 strict schema，只发送当前 Contract 字段。Email Code purpose 由各页面
固定，Register 成功后复用 AuthProvider 的唯一 `establishSession` 路径；Password Reset
成功只返回 Login，不自动建立 Session。

Registration 与 Recovery 各自使用一个 form-local synchronous action lock，串行化同一表单
内的 Public Account mutation。该锁只在本地校验与 challenge requirement 检查通过后获取，
并在 mutation settle 后释放；`isPending` 仍单独负责渲染层 busy/disabled feedback。

Google client script 只在 supported AntiBot 启用时由 Aureole-owned challenge wrapper 通过
HTTPS lazy-load，单例去重并 explicit render visible checkbox。Wrapper 处理 light/dark、
success、expired、error、reset 和 load retry；Google-specific browser API 不散落到表单。
Email Verification 与 AntiBot 同时启用时，发码 challenge 与最终 Register challenge 是两个
独立生命周期，前一个 mutation settle 后不可复用。

## Account self-service

`features/account` 持有 Preferences、Stats、Account Config 与 Password Change 的 API、query
和页面边界；现有 `/me` 仍由 Auth Session Core 独占并通过 `useAuth().currentUser` 复用。
Preferences、Stats 与 Account Config 均为 TanStack Query server state，query key 不包含
credential，且不进入 Zustand 或 browser storage。

Preferences 使用显式 Save 与 partial PATCH，只发送相对权威 GET 的实际差异。PATCH 不自动
retry；成功后重新读取权威 Preferences。NETWORK_ERROR、MALFORMED_RESPONSE、
UPSTREAM_ERROR 或 UPSTREAM_TIMEOUT 造成结果不确定时同样通过 GET 对账，无法完成对账时
不声明已保存或未保存。

Password Change 只发送 `currentPassword` 与 `newPassword`，mutation 不自动 retry，并使用
form-local synchronous lock 防止 same-tick 重复提交。成功意味着上游已使全部旧 session
失效；Aureole 复用 Auth `logout()` 清除 local credential 与完整 Query cache，再返回 Login。
密码 mutation 结果不确定时采用同样的保守退出策略，不重提 POST，也不声称修改成功或失败。

## Subscription read model

`features/subscription` 持有 Subscription Access 与 Overview 的 Public API parser、canonical
query keys 和 read-only presentation。Dashboard 与 Subscription Page 复用同一个 Overview
query；Access eligibility 与当前 product 相互独立，前端不得从任一 read 推断另一个 read 的
业务状态。普通 read failure 只影响对应 section，AUTH_REQUIRED/AUTH_FAILED 则复用 Auth
logout 清除 credential 与完整 Query cache。

Subscription `accessUrl` 是 solution-owned sensitive credential，只允许存在于 TanStack Query
memory state 和 API request result。它不进入 Zustand、storage、URL state、analytics、日志或
query key，也不成为 `href` 或 prefetch target。页面默认掩码，只有明确 Reveal 才显示完整值；
Copy 直接写入 clipboard，反馈不得包含 credential。Aureole 不请求
`/api/v1/access/subscription`，不下载或解析 subscription content。

Overview 只展示 Public Contract 原始字段。Byte formatting 与 absolute date formatting 仅是
presentation；不得生成 remaining traffic、usage percentage、remaining days、expiry flag 或
next reset date。`renewalAllowed` 只显示为“新周期功能已启用/未启用”，不表示当前用户可以执行
Advance Period。

## Read-only catalog, resources and traffic

Products、Resources 与 Traffic Logs 分别由 `features/catalog`、`features/resources` 和
`features/traffic` 持有，并使用 credential-free canonical TanStack Query keys。Plans 复用
Account 的 `['config', 'account']` query 获取 currency/currencySymbol，不建立第二套 config
cache identity。跨 read feature 的 recoverable error 与 AUTH_REQUIRED/AUTH_FAILED 退出行为由
共享 ReadError 和 Auth hook 提供；普通 read failure 不清空无关 query。

Product `amountMinor` 始终作为整数 authority。Money formatter 先用
`Intl.supportedValuesOf('currency')` 验证平台认识该 currency，再读取 Intl currency fraction
digits，并通过 BigInt 拆分 major/minor 后组合 solution-provided currencySymbol；不得硬编码
`/100`、手写 currency exponent table 或用 symbol 猜精度。平台能力、currency 或 amount 不安全
时仅隐藏价格格式化结果，不隐藏 Product catalog。

Resource response parser 只保留 id、name、category 和 online/offline status；UI 仅显示
name/category/status，不推断协议或暴露 host、IP、port、key、UUID、SNI、path 或 raw server
object。Resources 保持 authenticated route，Public Resource Status 仍是 post-v1。

Traffic History 使用独立 `['traffic', 'logs']` query 并组合到 Subscription Page。Entries 保持
server order，复用 Subscription byte formatter并显示 absolute recordedAt、upload、download 与
rateMultiplier metadata；不聚合 total/billed/effective traffic，不计算 cost，不排序、不轮询、
不绘制 chart，也不接触 subscription accessUrl 或 content endpoint。

## Notices read model

`features/notices` 持有 Notice List、Notice Detail 的 Public API parser、canonical query keys 与
展示边界。列表使用固定 `pageSize=20` 和 React local page state，严格保持 solution 返回顺序；
Dashboard 复用同一 List boundary 请求 page 1 / pageSize 1，只展示第一条 Summary，不请求正文，
也不推断 unread、important 或其他 Contract 不存在的状态。

Notice Detail 只在用户选择列表项后获取，并通过 Aureole-owned Radix Dialog 保留列表上下文。
`SafeNoticeHtml` 是未信任正文进入 React DOM 的唯一边界：API parser 将通过长度与类型校验的
HTML 保持为 opaque string，render boundary 再用 DOMPurify 的窄标签/属性 allowlist 清理。
脚本、事件属性、unsafe URI、样式、图片、iframe、表单、SVG 与其他 embedded content 均不进入
DOM，因此正文不会自动发起第三方资源请求。Detail 普通错误局部恢复，404 不退出 Session；
AUTH_REQUIRED/AUTH_FAILED 继续清除 credential 与完整 Query cache。

## Orders and commerce mutations

`features/orders` 持有 Order List、Order Detail 的 Public DTO parser、canonical query keys 与
只读展示。List 使用 `['orders', 'list']`，Detail 使用 `['orders', 'detail', id]` 并只在用户
选择后获取；credential 不进入 query key，订单 state 不进入 Zustand 或 browser storage。

Public Order 只包含 id、status、amountMinor、createdAt、updatedAt 和 expiresAt。Parser 强校验
这些字段并 strip additive unknown fields；UI 不连接 Products，也不推断套餐购买、续费、充值、
升级、降级、流量重置或支付方式。订单金额复用 Account canonical `['config', 'account']` query
与 `formatMinorMoney`；币种不可用或平台不支持时只隐藏格式化金额，订单本身仍保持可见。

五种 status 使用 Contract 冻结的用户语义分别展示。createdAt 只进行 absolute date/time
presentation；updatedAt/expiresAt 的 null 保持为明确未知状态，不根据当前时间、订单状态或其他
数据推导 expiry。List/Detail 普通错误局部恢复，ORDER_NOT_FOUND 不退出 Session；
AUTH_REQUIRED/AUTH_FAILED 继续清除 credential 与完整 Query cache。

M5-002 在 `features/orders` 内增加 Product Detail、Promotion Preview、Order Create 与 Order
Cancel 的前端边界。Plans 只负责选择 Product 并打开 Aureole-owned Order Create Dialog；Dialog
按需读取 Product Detail，不能把 List 的价格或可用性当作下单资格。Promotion 只在用户明确操作时
请求 preview；输入变化会丢弃旧 preview，UI 不计算折后价或最终应付金额。

Create request 只允许 productId、billingPeriod 和可选 opaque promotionCode，Cancel request 只使用
opaque Order ID 且无 body。两个 Order mutation 均显式禁用 retry，并使用 form-local synchronous
lock 防止 same-tick 重复提交。Create 的 network、timeout、upstream 与 malformed response 结果均视为
未知：先重新读取 Orders List，并在再次 POST 前要求用户明确确认已核对列表；该 guard 按 Product
保留到 Dialog 关闭之后。明确业务拒绝只允许用户手动重试。

Cancel 入口只对当前 Detail DTO 的 pending 状态显示，但 V2Board 仍是能否取消的唯一权威。用户必须
二次确认；完成后按错误类别重新读取 Detail 和/或 List。结果未知时不再次开放 Cancel；明确失败也要
先成功读取最新 Detail 才允许用户决定是否重试。恢复读取失败时保留最后已知 Detail 和安全提示，避免
控件卸载后误导用户。任何 mutation 或恢复读取返回 AUTH_REQUIRED/AUTH_FAILED 都复用 Auth logout。
M5-002 不调用 Order Status、Payment Methods 或 Checkout，也不持有 payment/callback state。

## Theme and presentation

Light、Dark、System 由 Theme Provider 管理；显式选择可保存为非敏感 local UI preference。CSS tokens 是颜色和 radius 的 SSOT，传统 `tailwind.config.js` 不是 token 核心。使用 system font 与 system monospace。

## Sensitive data policy

Bearer Token、Subscription Access URL、Gift Card Code、Withdrawal Account、Payment Payload 不得进入 console、analytics、error metadata 或 persistent local cache。API client 不记录 request body、Authorization Header 或 raw response。

## Deployment

Production Host 必须支持 unknown application route 到 `index.html` 的 SPA fallback，例如直接刷新 `/orders/123` 不得返回静态 404。Hosting provider 尚未选择，因此仓库不包含 provider-specific 配置。

## External dependency

```text
Aureole -> solution /api/v1 -> V2Board
```

solution Public Contract 是上游 SSOT。Aureole 不直接访问 V2Board、不依赖 Adapter route 或 raw DTO、不持有 V2Board Secret，也不复制业务状态或业务规则。
