# UX and Information Architecture

## Navigation

Desktop 使用 persistent sidebar、header 和 main content。Mobile 使用 hamburger 打开 focus-managed Sheet；不压窄 Desktop Sidebar、不提供横向挤压导航或 bottom tab bar。基础 icon button 和导航 touch target 接近 44 x 44 px。

一级导航顺序：Overview、Subscription、Plans、Resources、Orders、Wallet、Notices、Support、Referrals、启用的 Custom Pages、Account。Custom Pages 在 Desktop Sidebar 与 Mobile Sheet 使用同一配置和顺序；external mode 新窗口打开，iframe mode 留在 Auth Shell 内。Gift Card 归属 Wallet 流程，不作为一级导航。

## Route map

| Group  | Routes                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public | `/login`, `/register`, `/forgot-password`                                                                                                             |
| App    | `/dashboard`, `/subscription`, `/plans`, `/resources`, `/orders`, `/wallet`, `/notices`, `/support`, `/referrals`, `/settings`, `/custom/{stable-id}` |

`/` 根据真实 Auth State 跳转 `/login` 或 `/dashboard`。Auth bootstrap 未完成时不渲染 App Shell；临时服务错误显示可恢复状态，允许重试或 local logout。

## Responsive behavior

- Desktop 保持稳定导航位置和高信息密度，内容区域设置可读的最大宽度。
- Mobile 优先当前页面与导航入口；Drawer 可通过 close button、Escape、overlay 和导航选择关闭。
- iframe Custom Page 保留 Sidebar/Header/Theme/Auth Shell，并使用近全宽/全高内容区；始终提供“在新窗口打开”。
- 文本、URL、ID 和金额必须有 wrap/truncate 策略，不能挤压动作或越界。
- Active navigation 使用背景、字重和 leading indicator，不只依赖颜色。

## State baseline

- Loading：保留布局，提供明确且有限的 loading feedback；禁止无限 shimmer。
- Empty：说明当前没有什么，并提供真实可执行的下一步；不使用 fake data 填空。
- Error：以用户语言说明原因、影响和恢复动作；技术 code/requestId 可作为次级信息。
- Unknown mutation result：不宣称成功或失败，不盲目重提，先读取权威状态。

## High-risk UX

- Rotate Access 是 Danger：明确影响现有 access URL，并要求确认。
- Advance Period 是 Warning / Danger：明确不可逆影响并确认，不能自动 retry。
- Withdrawal 是 Financial Confirmation，不使用 destructive 文案或红色删除语义；确认提现方式、账户、申请性质与后续人工处理。Aureole 不采集或提交提现金额，实际提现规则由服务端决定。
- Promotion Validation 只显示 preview，不由前端声明最终付款金额。
- QR Payment 不使用“请勿关闭页面”；用户可离开并通过订单权威状态继续确认。
- Gift Card code 和 Withdrawal account 默认遮蔽，禁止出现在日志、analytics 或 error metadata。

## Accessibility

目标为 WCAG 2.2 AA baseline：semantic landmarks、正确 heading hierarchy、visible focus、icon-only accessible name、keyboard-accessible navigation/Sheet、可关闭 dialog、非纯颜色 active/status，以及 `prefers-reduced-motion`。
