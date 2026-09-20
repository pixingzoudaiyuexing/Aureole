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

`AppProviders` 依次组合 Theme、QueryClient、Runtime Settings、Auth、Tooltip 和 Router。每个 Provider
职责单一。Query 最多对 transient error retry 一次，mutation 永不全局自动 retry。

## Routing and code splitting

`_public` 提供 `/login`、`/register`、`/forgot-password`。`_app` 在统一 route group boundary 执行真实 Auth Guard：bootstrap 未完成时只显示安全 loading，未认证时 redirect `/login`，认证成功后才渲染 App Shell。`/` 根据同一 Auth State 决定 `/login` 或 `/dashboard`；已认证用户访问 public Auth route 会返回 `/dashboard`。

当前 guard 在 route component 边界阻止受保护 UI render。未来引入 protected TanStack Router loader 前必须重新评估 guard/loading 架构；Auth 未解析完成时，loader 不得提前发起 authenticated business fetch。

TanStack Router 插件启用 route-level auto code splitting；生成的 `src/routeTree.gen.ts` 提交到 Git，业务 route 产出独立 lazy chunk。

## Runtime Settings

REG-M01 Runtime Settings 是 anonymous `GET /api/v1/config/runtime` 的低权威展示快照，不是 Registry
Browser API，也不承担 Auth、API origin、CSP、路由、导航、entitlement 或业务 authority。它位于
`features/runtime-settings`：API boundary 用 Zod 验证七个 nullable Public fields 与 HTTPS-only runtime
logo/favicon URL，Query 使用 credential-free `['runtime-settings']` key，Provider 统一产生展示层有效值与
document metadata/favicon 副作用。

Runtime Settings 不阻塞 React、Router、public route、Auth bootstrap 或 AppShell。编译的 Aureole
brand/title/description/footer、Orbit logo 与无 runtime favicon override 是 first paint、pending、read
error、malformed response 和 all-null response 的回退。Query 只存在 memory，不进入 Zustand、storage、cookie
或 URL。有效 logo/favicon 由浏览器以 no-referrer 加载；Aureole 不 fetch、probe、proxy 或注入远端内容。此功能
不扩展 CSP。

## Custom Pages

CF-03B 使用 authenticated `GET /api/v1/custom-pages` 作为唯一 Production runtime Custom Page SSOT。
`src/config/custom-pages.ts`、`customPageDefinitions`、`customPages` 与 Vite static build validation 已移除；
不存在 dynamic + static merge、empty fallback 或 error fallback。Aureole 只消费 Public
`{id,title,url,mode}` DTO，不复制 Solution 的 Notice classifier 或 V2Board 语义。

Custom Pages 使用 credential-free `['custom-pages']` TanStack Query key，并复用全局 stale、retry 与
window-focus 配置。Query 只存在于 memory；Desktop Sidebar、Mobile Sheet、AppShell title 与 direct route
共享同一 cache。pending/error 不阻塞普通业务路由；empty 或失败时导航中没有 Custom Page。Server order
原样保留，所有 item 使用受信本地默认 icon，并固定放在 core application items 与 Account 之间。

External mode 使用 exact authoritative URL 与
`target="_blank" rel="noopener noreferrer"` 的语义 anchor。iframe mode 使用 authenticated
`/custom/$customPageId`。直达页在 Query pending 时显示局部 loading；success 后只允许相同 ID 的 iframe
item 渲染，missing 或 external ID 显示 unavailable，read error 提供安全 Retry。Refetch 后同 ID 的 title/URL
即时更新；authoritative remove 会卸载当前 iframe。

iframe 使用 validated authoritative URL 原值作为 `src` 和新窗口 fallback，不附加 token、user/account、
subscription 或 Aureole state。V1 无 Auth bridge、cookie bridge、postMessage、raw HTML、remote icon、target
probe 或 proxy。AppShell 只对 `/custom/*` 使用 `100dvh`/flex/min-h-0 full-content layout；普通业务路由继续
使用既有 max-width/padding。

V1 为兼容 VitePress 与独立静态工具而不设置 iframe `sandbox`。任意 sandbox 若需要支持 scripts、
same-origin、forms、downloads 或 popups，既可能破坏目标工具，也不能替代目标信任判断。补偿边界是：配置仅
来自严格 API boundary HTTPS validation、CSP `frame-src https:`、浏览器 same-origin isolation、
`referrerPolicy="no-referrer"`、无 Auth bridge/postMessage/script injection，以及始终可用的精确 URL 新窗口
fallback。跨域 iframe 的 X-Frame-Options、frame-ancestors、DNS 和 remote failure 无法被 Aureole 可靠
分类；UI 只显示中性 loading/help，不声称具体故障原因。

## API client

`src/lib/api` 使用 native `fetch` typed wrapper，集中处理 base URL、JSON、public envelope、HTTP status、requestId、network error 与 malformed response。路径必须以 `/api/v1/` 开头。业务分类只能依据 `ApiError.code`，禁止 `message.includes(...)`。

`VITE_API_BASE_URL` 是公开 solution Origin，不是 Secret。Auth session 只在 memory + `sessionStorage` 保存 opaque bearer，不解析、不写入 `localStorage`，也不持久化 Query cache。API Client 只通过显式 authenticated request boundary 添加 `Authorization: Bearer <opaque-token>`，并拒绝调用方手工注入 Authorization header。

`sessionStorage` 是正常的 tab-session persistence。如果浏览器因 privacy/security/quota 限制拒绝写入，登录可降级为当前 document lifetime 内的 memory-only session；页面刷新后无法恢复时按 unauthenticated 处理，禁止降级到 `localStorage`、IndexedDB、cookie 或 URL。

`features/auth` 独占 Login、session bootstrap 和 `/me` query 的前端 ownership。Zustand 只保存 access token 与 hydration 状态；`/me` DTO 只存在于 TanStack Query server state，不复制进 Zustand。Login mutation 明确不 retry，收到 token 后必须完成 `/me` bootstrap 才建立 authenticated UI。

Auth response parser 对 solution 的 additive unknown fields 保持兼容，同时 strip 未知字段，只把 Aureole 当前认识且已强校验的白名单字段交给应用层。Login 等 request schema 不因此放宽。

`AUTH_REQUIRED` / `AUTH_FAILED` 证明 credential 无效时，前端清除 memory、sessionStorage 和完整 Query cache 并回到 Login。`NETWORK_ERROR`、`UPSTREAM_ERROR`、`UPSTREAM_TIMEOUT` 不证明 credential 无效：保留 token，隐藏受保护 UI，并提供重试或 local logout。由于 solution 没有 Public logout endpoint，当前 Logout 只清理本地 credential 与 Query cache，不声明服务器撤销。

## Public onboarding and challenge

Active Public Contract baseline 是 re-frozen solution
`3cc0de610b8e748b5d88d2ab3444e08461ab91ef`。Solution Public API 使用 wildcard
non-credentialed CORS；Bearer 仍是显式认证机制，Origin 不参与身份或授权。Onboarding config 属于 TanStack
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

## Subscription read model and mutations

`features/subscription` 持有 REG-M04/M06 Delivery Options、selected access-link credential、Overview 与既有
mutation 的 Public API parser、canonical query keys 和 presentation。Dashboard 与 Subscription Page
复用同一个 Overview query；entry eligibility 与当前 product 相互独立，前端不得从任一 read 推断
另一个 read 的业务状态。普通 read failure 只影响对应 section，AUTH_REQUIRED/AUTH_FAILED 则复用
Auth logout 清除 credential 与完整 Query cache。

`GET /api/v1/subscription/delivery-options` 是 active 入口集合权威，只公开有序 stable `id/label` 与
`defaultEntryId`。React local state 的 `selectedEntryId` 是 current selection source；sessionStorage 只
fail-safe 保存该 non-sensitive stable ID。历史 CF-02 baseUrl 不做推断迁移。有效 persisted ID 优先，否则只
使用 validated defaultEntryId；default 为 null 时不发明首项默认。运行中 selection 消失或 access-link 返回
`SUBSCRIPTION_ENTRY_UNAVAILABLE` 时进入 explicit reselection。

`POST /api/v1/subscription/access-link` 的 Contract 继续支持 `profileId=default` 与
`subscriptionInfo=show|hide`，并返回 exact authoritative HTTPS credential。活动页面只主动发送
`subscriptionInfo=show`，不提供 show/hide 产品控件，也不重写服务器返回的既有 URL。`accessUrl` 不进入
TanStack Query、Query key、Zustand、storage、URL state、cookie、analytics 或日志；它只存在于 keyed child
component 的局部 state 与当前 render。成功后页面直接显示 current accessUrl；Copy、local QR 与
Clash/Shadowrocket/Quantumult X/SingBox user-gesture builders 只消费同一个 URL，且不会修改 credential URL。

Entry、Auth generation 或 runtime ownership 变化会先 suppress/unmount旧 credential，再发起新的 show
access-link。每个请求使用 AbortController 与 monotonic request generation；completion 还必须匹配 current
accessToken、Auth generation 与 entryId，避免晚到 A response 出现在 B/session B。普通失败与 malformed
response 都 fail closed，不恢复旧 credential。`SUBSCRIPTION_ACCESS_UNAVAILABLE` 是后端权威拒绝：不显示
credential 或其 Copy/QR/Import actions；502/504 等暂时性故障保持可恢复错误，不被解释为无资格。Aureole 不请求
`/api/v1/access/subscription`，不下载或解析 subscription content；REG-M05 profile transformation 不在本阶段。

Overview 只展示 Public Contract 原始字段。Byte formatting 与 absolute date formatting 仅是
presentation；不得生成 remaining traffic、usage percentage、remaining days、expiry flag 或
next reset date。`renewalAllowed` 只显示为“新周期功能已启用/未启用”，不作为 Advance action 的
visibility、enabled state 或 POST eligibility authority。

AUR-M6-001 的 `POST /api/v1/subscription/rotate-access` 继续没有 request body、显式 `retry:false`，
并使用 Subscription Page 共享 synchronous lock 防止 same-tick 重复提交。入口只依据当前 selected
entry credential 是否可用显示，最终 eligibility 始终由 solution/V2Board 判断；用户必须阅读
credential 失效后果并勾选确认后才允许提交。

Rotate response 的 solution legacy gateway `accessUrl` 不是 UI authority，也绝不写入 Query。Success、409、
明确 failure 与 UNKNOWN 都先 suppress 当前 credential，再只对 current entryId/default/show access-link
重新执行 access-link。成功 re-resolution 通过 keyed runtime remount 重置 copy/QR/import transient state；
恢复失败时旧 credential 不能重新启用，并继续 fail closed 阻断 Rotate 与 Advance。
UNKNOWN 不根据 URL 变化推断因果，恢复成功后仍要求新的明确确认。Mutation 或 recovery 的 Auth failure
继续复用 sealed Auth Session Core。AUR-M6-001 不请求 subscription content。

Rotate feedback、recovery owner 与 UNKNOWN acknowledgement 的生命周期高于 selected entry；入口切换或
`422 SUBSCRIPTION_ENTRY_UNAVAILABLE` 进入 explicit reselection 时不能卸载该 owner。Credential
Copy/QR/Import 仍由 `accessUrl` keyed child 独立重置。Recovery block 期间，普通 entry switch 不会
自动解除 block；用户完成 explicit selection 后，必须通过仍可见的 manual recovery 对当前 selected entry
再次进行 authoritative read，成功后才能解除 Rotate/Advance block。若原 outcome 为 UNKNOWN，恢复后仍
保留“再次重置订阅地址”及专用 acknowledgement。Destructive mutation 与其 entry-access recovery request
进行中会临时锁定 selector，避免异步 continuation 对旧 selection 完成恢复；请求 settle 后才重新允许切换。

AUR-M6-002 增加 bodyless `POST /api/v1/subscription/advance-period`，成功只接受
`advanced=true`，additive fields 在 API boundary 被 strip。Advance 与 Rotate 共用同一个同步锁，
因此任一 mutation pending 时另一个不能提交，same-tick 跨操作确认也最多产生一个 destructive
POST。Advance action 在 authenticated Overview panel 可用时始终渲染；`renewalAllowed` 不控制是否可尝试。
流量耗尽、reset policy 与剩余有效期均不在前端计算，最终由 POST 权威判断。仅当 shared action pending、
recovery failure 或 `recoveryBlocked` 使 mutation 暂时不安全时，visible action 才被 disabled。

Advance 成功、四类 definitive error 与四类 UNKNOWN 均重新读取 canonical
`['subscription', 'overview']`，不本地归零流量或修改到期时间。成功 POST 后的 GET 失败不改变
mutation 已成功的结论，但会 fail closed；UNKNOWN 不根据 Overview 变化推断因果，并在恢复成功后
要求新的专用 acknowledgement 才允许再次提交。任何 recovery read 失败都会同时禁止 Advance 与
Rotate，直到手动 Overview read 成功；任一边界的 AUTH_REQUIRED/AUTH_FAILED 继续复用 Auth Session
Core。Advance 不 invalidate Access 或 Traffic History，也不请求 subscription content。
CF-04 不实现 automatic Advance、background timer、scheduler、feature flag 或 browser-storage preference。

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
M5-002 不持有 payment/callback state。

M5-003 在独立 `features/payments` 边界实现 Payment Methods 与 Checkout，并在 `features/orders`
复用 canonical Order Status。Payment Methods 使用无 credential 的 `['billing', 'methods']` query，
只在用户从 pending Order Detail 明确打开支付流程后读取；Order Status 使用
`['orders', 'status', id]`。两者都是 TanStack Query server state，不进入 Zustand 或 storage。

Checkout request 只发送 strict `paymentMethodId`，mutation 显式 `retry: false`，并与 Cancel 共用
当前 Order Detail 的同步 action lock。`finished`、QR 与任何不确定 POST 结果均不能直接声明付款完成；
客户端只通过 `GET /api/v1/orders/{id}/status` 获取权威状态。QR opaque content 仅在本地通过
`qrcode.react` 生成，不 fetch、不解析、不持久化；redirect target 只在用户点击“前往支付”后使用
当前 tab 原样导航，也不持久化。

QR 或 finished-pending 流程约每 3 秒轮询一次 Order Status，非 pending、Payment UI 关闭、route
unmount、Auth failure 或约 5 分钟 hard cap 时停止。状态变化后刷新 Detail/List；hard cap 后只允许
用户手动刷新状态，绝不自动重复 Checkout。NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR 与
MALFORMED_RESPONSE 先读取 Status/Detail/List，并要求用户显式确认已核对状态后才能再次 POST。
Payment Method fee 只显示 fixedMinor 和 percent metadata；fixedMinor 复用 Account Config 与
`formatMinorMoney`，不得计算 percentage fee 或最终应付金额。

## Wallet balance, deposit and Gift Card model

`features/wallet` 持有 Wallet Public DTO parser、canonical `['wallet']` query 与 `/wallet`
展示。`GET /api/v1/wallet` 是站内余额的唯一权威，`balanceMinor` 必须是
`0..2147483647` 整数；Aureole 不从 Orders、Commission、pending Deposit 或其他客户端状态推导、
累加或缓存余额，也不建立 Wallet ledger 或 transaction history。

Wallet 复用 Account canonical `['config', 'account']` query 和 `formatMinorMoney` 展示金额，
不硬编码 currency、symbol、fraction digits 或 `/100`。Account Config loading、failure 或平台不支持
该 currency 时均不猜测币种，只隐藏格式化金额并提供局部恢复。Wallet 与 Config 都是 TanStack Query
server state，不进入 Zustand、storage、URL、console 或 analytics；普通 read failure 局部 Retry，
AUTH_REQUIRED/AUTH_FAILED 继续复用 Auth Session Core 清除 credential 与完整 Query cache。

Wallet Deposit 使用 credential-free `['wallet', 'deposit-create']` mutation key，并只向
`POST /api/v1/wallet/deposits` 发送 strict `{ amountMinor }`。人类金额输入根据 Account Config currency
的 canonical fraction digits，以 string/BigInt 精确转换为 `1..2147483647` minor unit；不使用浮点
金额运算，也不复制 V2Board minimum、maximum、bonus、fee 或 pending-order 业务规则。成功 DTO 复用
Orders 的 opaque order ID schema。

Deposit Create 是非幂等金融 mutation：第一次操作只打开金额确认 Dialog，确认 POST 明确
`retry: false` 并使用同步锁阻止 same-tick 重复。成功只保存当前页面临时 Order ID、重新读取 canonical
Orders List 并提供 `/orders` handoff；不刷新、修改或预测 Wallet balance，不自动读取 Payment Methods、
Checkout 或 Status。用户支付及状态确认继续由既有 Orders / Payment flow 持有。

`WALLET_DEPOSIT_UNAVAILABLE`、`WALLET_DEPOSIT_AMOUNT_INVALID` 与
`WALLET_DEPOSIT_CREATE_FAILED` 使用本地安全文案且不自动重试。NETWORK_ERROR、UPSTREAM_TIMEOUT、
UPSTREAM_ERROR 与 MALFORMED_RESPONSE 保持 UNKNOWN：只读取 Orders List，不按 amount、createdAt、
list diff 或新 ID 推断因果；恢复失败时 fail closed，恢复成功后也必须先确认已检查订单，再重新进入标准
金额确认。金额、created Order ID、UNKNOWN guard 与 feedback 只在 React local state，不进入 storage、
URL、Zustand、console 或 analytics。

Gift Card Redeem 使用 credential-free `['gift-cards', 'redeem']` mutation key，并只向
`POST /api/v1/gift-cards/redeem` 发送 strict `{ code }`。Code 按用户输入原样提交，不 trim、改变
大小写或移除空格/连字符；只存在于当前 React input 与 mutation request 生命周期。输入默认 password，
确认 Dialog 只显示 masked value，成功后立即清空 code 与 reveal state。

Gift Card success 只接受 `redeemed: true` 与 balance、validity、traffic、trafficReset、plan 五种
Public effect。Signed INT 原样展示，不 abs、clamp、round 或转换为新的账户状态；balance effect 使用
同一 canonical currency fraction digits 的 `formatSignedMinorMoney`，Config 不可用时只显示 signed
minor-unit fallback。Aureole 不计算新余额、到期时间、流量、reset day 或套餐。

成功后重新读取 canonical Wallet、Me 与 Subscription Overview，并以 `refetchType:none` invalidate
Wallet、Subscription Overview 与 non-secret `delivery-options` Query。三项 authoritative reconciliation read 仍为
Wallet、Me 与 Subscription Overview；delivery-options 只包含 non-secret delivery selection metadata。Gift Card 不自动
请求 access-link、不缓存或持久化 `accessUrl`，也不建立 Subscription credential authority；Subscription credential
authority 仍由现有 component-local ephemeral access-link runtime 持有。必要 read 任一失败时仍保留“礼品卡已兑换”，但
fail closed 到三项全部读取成功。UNKNOWN 同样读取三项 authority，但绝不根据字段变化推断本次兑换成败；全部成功后仍需专用
acknowledgement 与新的标准确认才能再次 POST。Deposit 与 Gift Card 共用页面级同步 Wallet mutation
coordinator，最多一个金融 POST 处于活动状态。Gift Card history/preview、ledger、pending balance、
bonus/fee、第二套 Payment flow 和其他后续里程碑能力均未实现。

## Support Ticket read model

`features/tickets` 持有 Support Ticket List 与 Detail 的 Public DTO parser、canonical Query 和
只读页面边界。`GET /api/v1/tickets` 使用 credential-free `['tickets']` query；
`GET /api/v1/tickets/{id}` 只在用户选择一条工单后使用 `['tickets', 'detail', id]` lazy query，
不会进入页面时为每条工单预取 Detail。Ticket ID 复用 `1..2147483647` 的正整数 schema，非法本地
ID 在 HTTP request 前被拒绝。

List 与 Message 都保持 solution 返回顺序，不按时间、优先级、状态或 sender 重排。Parser 只保留
Public `id`、`subject`、`priority`、`status`、timestamps、message `content` 与 `fromMe`，strip additive
字段，并把已知字段、枚举、ID、timestamp 或 message 形状异常统一归类为 MALFORMED_RESPONSE。

`subject` 与 message `content` 是不可信账户文本，只由 React text rendering 展示；不作为 HTML 或
Markdown 解释，不使用 `dangerouslySetInnerHTML` 或 sanitizer。Message 使用 `white-space: pre-wrap`
保留换行，并允许长单词和 URL 断行。Ticket data 只存在于 TanStack Query memory 和当前 React selection，
不进入 Zustand、storage、URL、analytics 或 console。

普通 List failure 保留 Support layout 并提供局部 Retry；Detail ordinary failure 与
`TICKET_NOT_FOUND` 只影响 Detail，List 保持原样。List 或 Detail 的 AUTH_REQUIRED/AUTH_FAILED 继续复用
sealed Auth Session Core 清理 credential 与完整 Query cache。AUR-M8-001 不实现 Ticket mutation、
attachment、unread、search/filter、counter 或任何 Referral / Commission / Withdrawal 能力。

AUR-M8-002 在同一 `features/tickets` 边界增加 `POST /api/v1/tickets`。Create request 使用 strict
schema，只原样发送 `subject`、Public `priority` 和 `message`；不 trim、normalize、sanitize、转换
Markdown 或发送 V2Board `level`。Mutation key 是 credential/content-free 的
`['tickets', 'create']`，显式 `retry: false`，并使用同步 action lock 阻止 same-tick 重复 POST。
Form 与 UNKNOWN guard 仅由 React local state 持有，不进入 Zustand、Query key、storage、URL、
analytics、console 或 error metadata。

Create success 只接受 literal `{ created: true }`，不返回或推断 Ticket ID。Confirmed success 清空
form、恢复默认 `normal`、关闭 Dialog，并重新读取 canonical Ticket List；不会按 subject、priority、
timestamp、list diff、ID 或 server order 认领/打开某条 Ticket，也不会预取 Detail。Success 后 List
reconciliation 失败仍保持“工单已提交”，但 Create fail closed，直到手动 List GET 成功。

`TICKET_UNAVAILABLE` 使用泛化资格文案并重新读取 List；`TICKET_CREATE_FAILED` 与
`VALIDATION_ERROR` 保留可编辑原文并要求新的显式提交。NETWORK_ERROR、UPSTREAM_TIMEOUT、
UPSTREAM_ERROR、MALFORMED_RESPONSE 及 non-ApiError 都是 UNKNOWN：立即读取 List，但不从结果推断
本次 Create outcome；List 成功后仍要求用户确认已检查列表，修改 payload 会清除 acknowledgement。
List recovery 失败时只开放手动 GET recovery。Create 或任一 reconciliation/recovery GET 的 Auth
failure 继续复用 sealed Session Core。本阶段仍不实现 reply、close 或后续 Milestone。

Independent Review required fix 在 Create local guard 之外增加 authoritative Ticket List prerequisite。
`TicketsContent` 只有在 canonical List query `isSuccess && !isFetching` 时才向 Create flow 声明 authority
ready；初始 loading/error、List Retry、cached stale data 的 fresh refetch、以及任意 reconciliation 后的
List failure/fetching 都会禁用 Create trigger 和最终 submit。这样即使 reload/remount 清除了 React local
UNKNOWN 或 confirmed-success feedback，只要当前页面生命周期尚未成功完成新的 List read，就不能再次
发送非幂等 POST。恢复继续复用现有 List Retry/GET，不持久化 mutation guard 或 Ticket 内容。

AUR-M8-002 已通过 Independent Create Ticket Mutation Review。AUR-M8-003 在同一 feature boundary
增量加入 `POST /api/v1/tickets/{id}/reply` 与 `POST /api/v1/tickets/{id}/close`。Reply 复用既有
Ticket ID schema，并原样提交 strict `{ message }`；Close 不发送业务 body。Success parser 只接受
literal `{ replied: true }` / `{ closed: true }` 并 strip additive fields。两个 mutation 使用不含
credential、Ticket ID 或内容的 `['tickets','reply']` / `['tickets','close']` key，均显式
`retry: false`。

Ticket Detail 是 Reply/Close 的 mutation authority。页面与执行函数都要求 canonical Detail query
`isSuccess && !isFetching`、query fetch idle、返回 ID 等于当前 selection 且 authoritative status 为
`open`；initial load、ordinary error、cached refetch、fresh refetch failure 与 remount recovery 均
fail closed。Reply 与 Close 共享 feature-local synchronous action coordinator，same-tick 最多启动一个
POST；mutation 与对账期间 Detail Dialog 不能关闭后重开绕过。Closed Detail 只展示已关闭事实，不提供
Reply、Close 或 Reopen。

Confirmed Reply/Close success 分别只证明 mutation receipt，随后重新读取 selected Detail 与 canonical
List；不会 append message、生成 ID/time、改 status/updatedAt 或写 Query cache。Detail reconciliation
失败不会把 confirmed success 改口为失败，只开放 GET-only manual recovery。`TICKET_REPLY_FAILED` 与
`TICKET_CLOSE_FAILED` 使用泛化文案并重新读取 Detail；`TICKET_NOT_FOUND` 重新读取 List 而不本地删除
row；`VALIDATION_ERROR` 保留 Reply 原文。

NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、MALFORMED_RESPONSE 与 non-ApiError 都视为
UNKNOWN。Detail recovery 只建立当前事实，不按相同 content、message count/new ID、createdAt proximity
或 status 变化推断刚才 mutation 的因果结果。Recovery 后 open 状态再次 Reply/Close 前分别要求专用
acknowledgement，且 Close 仍需标准 confirmation；Reply payload 变化会清除 acknowledgement。Recovery
失败只允许 GET Detail，所有 mutation/reconciliation/recovery 的 Auth error 继续进入 sealed Session
Core。Reply draft 和 UNKNOWN guard 仅为 React local memory，不持久化。

## Referral, commission read model and guarded mutations

`features/referrals` 持有 Referral Overview、Commission History、Withdrawal Options 与受保护 mutation 的 Public DTO
parser、canonical Query 和 `/referrals` 页面边界。三个 authenticated GET 分别使用
`['referrals','overview']`、`['referrals','commissions',page,20]` 与
`['referrals','withdrawal-options']`；Account Config 继续复用 canonical
`['config','account']`。这些 server state 不进入 Zustand、storage、URL、analytics 或 console，Query key
不包含 credential、referral code、email、withdrawal account 或 money value。

Overview parser 只保留 ordered referral `codes` 与五项 Public `stats`。Code 必须是 1..32 ASCII
alphanumeric，timestamp 必须是 ISO datetime；registered users、三项 commission minor-unit amount 均为
non-negative safe integer，rate 是 0..100 integer。Commission History 固定请求 pageSize 20，保持 item
顺序，只展示 order amount、commission amount 与 createdAt；page、pageSize 与 total 都按 Public Contract
严格验证，页码仅由 React local state 持有。

三项 commission amount 与 history amount 都复用 Account Config 和 `formatMinorMoney`，不硬编码币种、
symbol、fraction digits 或 `/100`。Config loading、ordinary failure 或 unsupported currency 不隐藏 Referral
data，而以明确的“最小货币单位”fallback 展示并提供 Config Retry。`availableCommissionMinor` 始终属于
Referral / Commission domain，不进入 Wallet query、Wallet balance 或任何合计。

Overview、Commission History、Withdrawal Options 与 Account Config 各自 loading/error/retry；普通错误仅
影响对应 section，任何 AUTH_REQUIRED/AUTH_FAILED 继续复用 sealed Auth Session Core 清理 credential 与
完整 Query cache。Referral code 只在用户明确点击时写入 clipboard；页面不生成 referral URL/QR，也不
排序、去重或生成 code。Withdrawal Options 保持 enabled 与 ordered method identifiers，不推断品牌、
手续费、minimum、额度或到账时间；Withdrawal Request 只消费该 fresh authority。

AUR-M9-001 已完成并冻结于 `445ffac542d89977f2db5b631516b6c3bbdc955f`。
AUR-M9-002 在同一 feature boundary 增加 bodyless `POST /api/v1/referrals/codes`；成功只接受
`{created:true}` 并 strip additive fields。Mutation key 为 content/credential-free 的
`['referrals','create-code']`，显式 `retry:false`，标准 confirmation 与同步 action lock 保证只有明确确认
才发送一次 POST。

Create 只在 canonical Overview `isSuccess && !isFetching` 时开放，Overview query 在页面 remount 时强制
fresh read；真正调用 mutation 前还会同步读取 QueryClient state，要求 Overview query 当前同时满足
`status=success`、`fetchStatus=idle` 且 data 存在，避免 React prop 尚未 commit 时穿透 POST。confirmed
success、`REFERRAL_CODE_LIMIT_REACHED` 与 UNKNOWN 都只重新读取
`GET /api/v1/referrals`；不 invalidate Commission、Withdrawal 或 Wallet。成功 DTO 不含 code identity，
因此页面不 append、生成、自动复制、高亮或通过 list diff/timestamp 推断某个 code 属于本次操作。成功对账
失败保持 confirmed success 但 fail closed。

UNKNOWN classification 会立即在独立的 `['referrals','create-code-uncertainty']` local guard key 写入 enum-like
`active` marker。它不是 solution DTO 或 server state，不包含 code、token、email、amount、timestamp、error
message 或 list；`gcTime:Infinity` 使其在同一 authenticated SPA session 内跨 feature unmount/remount 保留，
但不进入 storage、URL、Zustand、analytics 或 console。fresh Overview 只能恢复当前 list authority，不能清除
mutation uncertainty；用户明确 acknowledgement 后 marker 变为 `acknowledged`，取消勾选会恢复 `active`，
下一次真正 POST 前清除已确认 marker。Auth logout/establishSession 的 `queryClient.clear()` 自然清除整个 local
guard，防止跨 session 泄漏。所有 mutation/recovery Auth error 继续复用 sealed Session Core。

AUR-M9-002 已完成并冻结于 `ba106d1c7d7b69fbc9b5b52837c3abee939ef218`，Independent Referral Code
Mutation Review PASS。

AUR-M9-003 增加 `POST /api/v1/referrals/commissions/transfer`。Request 使用 strict
`{amountMinor}`（1..2147483647 integer），success 只接受并 strip `{transferred:true}`；mutation key 为
`['referrals','commission-transfer']`，显式 `retry:false`。用户输入 major-unit 文本，金额解析和展示继续复用
`parseMoneyInputToMinor` / `formatMinorMoney` 与 canonical Account Config，不硬编码两位小数、币种或 symbol，也不提供
“全部划转”。

Transfer 只有在 canonical Overview、Wallet 与 Account Config 都 fresh success、idle、币种可安全处理且 session safety
storage 可读时开放；Wallet 在 Transfer 页面 remount 时强制 fresh read。标准 financial confirmation 保存 amount 与
currency semantics 的 React memory snapshot，展示当时的可用佣金和账户余额但不预测划转后余额。同步 lock 后、POST 前
会直接读取 QueryClient current state，再次验证三项 authority、独立 uncertainty marker、币种快照和当前可用佣金。
验证通过后必须先同步把 content-free safety marker 持久化为 `active`，再同步更新 QueryClient marker，随后无 `await`
调用 `mutateAsync`。持久写入失败时零 POST 并 fail closed。

confirmed success、`INSUFFICIENT_COMMISSION_BALANCE`、`COMMISSION_TRANSFER_FAILED` 与 `VALIDATION_ERROR` 都只通过 exact
`GET /api/v1/referrals` 和 canonical `GET /api/v1/wallet` 对账，不刷新 Commission History、Withdrawal Options、Orders
或 Subscription，也不使用 `setQueryData` 修改 server financial state。成功后的任一 GET 失败不推翻 confirmed success，
但会 fail closed 并只开放双 GET manual recovery。

Commission Transfer uncertainty 同时使用 QueryClient local guard
`['referrals','commission-transfer-uncertainty']` 和 session-scoped
`aureole.safety.commission-transfer-uncertainty`。后者只允许 `active` / `acknowledged` / key absent，使同一 tab 的
full-document reload 能恢复 safety state；首次 render 同步读取 marker，在读取失败时 fail closed，不出现 marker 尚未
hydrate 而短暂开放的首帧。

NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、MALFORMED_RESPONSE 与 non-ApiError 都是 UNKNOWN。因为 POST 前已
pre-arm，pending 期间、handled UNKNOWN 和旧 runtime 在 response 前被 reload 的情况都保持 persistent `active`。catch
只清空 amount/snapshot 并执行 Overview 与 Wallet recovery；无论 recovered balance delta 刚好匹配还是完全不变，都不
推断本次 outcome。只有双读恢复且用户明确 acknowledgement 后，两层 marker 才同步变为 `acknowledged`；取消勾选同步
恢复 `active`。下一次 POST 前再次 pre-arm `active`。可信 `{transferred:true}` 或 definitive rejection 才清除两层 marker，
然后对账。

Persistent marker 不包含金额、余额、币种、token、email、timestamp 或错误信息，也不使用 localStorage。普通 credential
hydrate 保留 marker。真正 authenticated session boundary 会递增仅内存 session generation，并准备 financial safety state：
`active` 保持 `active`，`acknowledged` 降级为 `active`，absent 保持 absent。这样 logout/new login/Auth invalidation 不会删除仍
无法确认的 non-idempotent operation，也不会把旧 Session consent 继承给新 Session。Referral Code Create 仍保持原
memory-only guard，不属于 financial runtime registry。

AUR-M9-003 已完成 Independent Financial Mutation Review、Primary Full-Reload Hardening、Same-Runtime Financial
Concurrency Hardening 与 Cross-Session Financial Continuation Hardening，最终冻结于
`e408f83311c3557706ac9fc09ac06fe754ea71b8`。

AUR-M9-004 增加 strict `POST /api/v1/referrals/withdrawal-requests`，只发送 `{method,account}`；两个字段分别严格限制为
1..255 与 1..1024 个字符并保持原始字符串，success 只接受 `{requested:true}`。Public Contract 没有 amount，因此 UI、
request、confirmation 和 recovery 都不采集、计算、显示或推断提现金额、minimum、手续费、剩余佣金或预计到账结果。

Request form 只在 canonical Withdrawal Options fresh success、idle、`enabled=true` 且 `methods.length>0` 时开放，Options 在
页面 remount 时强制 fresh read。method 只能按 server order 从当前 identifiers 中选择，不排序、去重、翻译或映射品牌；
account 默认 password-style 遮蔽，只存在于当前 React memory 和临时 request body，不进入 Query/Mutation key、storage、
URL、Zustand、analytics、console 或 error metadata。Dialog snapshot 只保存在 React memory，默认遮蔽 account，关闭后恢复
hidden；任何 POST settle 会从 TanStack Mutation cache 清除敏感 variables。

第一次点击只打开 Financial Confirmation，不发送 POST；确认文案明确“提交申请”不等于到账。真正 Confirm 使用同步 lock，
随后直接读取 QueryClient current Options state，重新检查 success/idle、enabled、method exact membership、account 长度和独立
uncertainty guard。全部通过后先同步写入
`sessionStorage['aureole.safety.withdrawal-request-uncertainty']='active'`，再同步更新
`['referrals','withdrawal-request-uncertainty']`，然后无 `await` 调用 `mutateAsync`；持久写入失败时零 POST。

可信 `{requested:true}` 只表示申请被服务端接受；definitive rejection 包括 `WITHDRAWAL_DISABLED`、
`WITHDRAWAL_METHOD_UNSUPPORTED`、`WITHDRAWAL_MINIMUM_NOT_MET`、`WITHDRAWAL_REQUEST_FAILED` 与
`VALIDATION_ERROR`。两类结果都清除独立 marker、清空敏感 account，并只 exact refetch Withdrawal Options。Options refetch
失败不改变已确认 success/rejection，但下一笔申请 fail closed，只开放 GET-only recovery。

NETWORK_ERROR、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、MALFORMED_RESPONSE、未知 Public error 与 non-ApiError 都视为 UNKNOWN。
account、method 与 confirmation snapshot 立即清空，persistent/local marker 保持 `active`。Withdrawal Options 只恢复当前开放
状态与 methods authority，任何 enabled/method 变化、Referral Overview、Commission balance、Wallet、Orders 或 Support Ticket
都不得用于推断上一笔申请结果。fresh Options 成功后仍需用户明确 acknowledgement 才能变为 `acknowledged`；下一次 POST
仍需重新选择、输入、确认并再次 pre-arm `active`。

Withdrawal marker 与 Commission Transfer marker 独立，均只允许 `active` / `acknowledged` / absent。普通同 session credential
hydrate 保留二者；logout、new session、Auth invalidation 清 credential 与 QueryClient，但按上述 auth-boundary 规则保留或降级
financial marker。跨账户看到 content-free active marker 是允许的 conservative same-tab safety behavior，不代表新账户拥有旧
账户业务状态。AUR-M9-004 不修改 solution、不直接访问 V2Board、不读取 Withdrawal status/list/detail 或 Support Ticket，也不
进入 Launch Readiness。

Commission Transfer 与 Withdrawal Request 现在各自使用同一个轻量 shared pending helper，但仍按 exact mutation key 隔离。
UI 层通过 exact `useIsMutating` 订阅同一 QueryClient 的 pending mutation；即使原 Control 因 SPA navigation unmount，只要旧
mutation 仍 pending，新 Control 就显示处理中状态并禁用 form、Financial Confirmation、UNKNOWN acknowledgement 和 manual
recovery。Withdrawal pending 不阻塞 Commission，Commission pending 也不阻塞 Withdrawal 或 Referral Code Create。

真正 POST 前仍在同步 action lock 与 authority/validation 检查之后，直接读取 MutationCache 并要求 exact same-key pending
不存在，避免 hook render 尚未更新时穿透。该 helper 只比较 mutation key 与 `state.status='pending'`，不读取 amount、method、
account、token 或 mutation variables。Withdrawal settle cleanup 只移除 exact same-key 的非-pending entries，不能删除任何仍
pending mutation。

MutationCache 是 same-runtime in-flight fact；sessionStorage marker 是 cross-runtime/full-document reload uncertainty fact。
same-runtime pending settle 为 success/definitive 后，旧 continuation 可清 marker 并执行原有 authority reconciliation，因为 gate
保证不存在 Attempt B；UNKNOWN settle 则继续保留 active marker，fresh authority 后才开放 acknowledgement。full runtime replacement
会丢失 MutationCache，但必须保留原有 persistent active/acknowledged reload 语义，不能因 pending count 为零自动清 marker。

Cross-session hardening 在上述两层之外新增 QueryClient-independent runtime financial attempt registry 与 authenticated session
generation。Registry 只按 exact operation key 保存 opaque handle，`tryBegin` 同步完成 check + register；旧 handle 只能释放自身，
不能清除未来 handle。`useSyncExternalStore` 让 registry 在 `queryClient.clear()` 后仍能驱动新 Session UI 的 pending 状态。真正 POST
前顺序为 synchronous lock、current authority/validation、MutationCache exact check、runtime atomic begin、capture generation、
persistent pre-arm、立即 mutation；pre-arm 失败时释放自己的 handle并保持零 POST。

每个 financial continuation 在 mutation settle 后首先检查 captured generation。若 Session 已变化，旧 continuation 不清/确认新
Session marker，不修改 uncertainty Query state，不 invalidate/refetch/write canonical financial queries，不使用旧 token GET，不触发
新 Session logout，也不显示旧 outcome feedback；只在 finally 最后释放自身 runtime handle。current-session reconciliation 不直接
把旧-token `fetchQuery` 绑定到 canonical key，而是先取得临时结果，generation 仍匹配才写 QueryClient，从而覆盖 GET 进行期间的
Session 切换。runtime handle 始终在所有允许的 shared cleanup 之后释放，避免新 attempt 在旧 cleanup 尚未完成时启动。

最终 safety layers 分工为：form-local synchronous lock；QueryClient MutationCache exact pending；QueryClient-independent runtime
attempt registry；sessionStorage cross-runtime uncertainty；authenticated session generation stale-continuation gate。Abort 不作为
non-idempotent POST 的安全证明。AUR-M9-004 已通过 Independent Withdrawal Financial Mutation Review、Required Fix、Same-Runtime
Financial Concurrency Hardening 与 Cross-Session Financial Continuation Hardening，最终冻结于
`e408f83311c3557706ac9fc09ac06fe754ea71b8`。Milestone 9 已完成并冻结；生产运行时证据仍属于后续 Launch Readiness。

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
