# Design Constraints

## Approved direction

Gemini approved direction 由本 Task 冻结为：Modern、Lightweight、Refined、High Information Density、System Font、Border-first、Minimal Shadow。Aureole 是高信任账户门户，不采用 generic AI dashboard、巨大 KPI cards、fake charts、glassmorphism、过大圆角、过度渐变或装饰动画。

视觉参考只用于行为与质感：Stripe Dashboard 的可信商业操作、Linear 的清晰密度、shadcn/Radix 的可访问原语。不得复制无关 admin demo。

## UI-01 to UI-09

- **UI-01 Promotion:** validation 只是 preview；最终 payable amount 必须来自权威 checkout/order response。
- **UI-02 Notices:** Contract 没有 unread / important，前端不得发明 badge、筛选或状态。
- **UI-03 Orders:** 只认 `pending`、`processing`、`cancelled`、`completed`、`adjusted`，并翻译为用户语言。
- **UI-04 Withdrawal:** 使用 Financial Confirmation 语义，不按 destructive action 呈现；确认信息与未知结果恢复必须明确。
- **UI-05 Gift Card:** redeem 成功至少 invalidate Wallet、Subscription Overview、Me；code 是敏感数据。
- **UI-06 Traffic:** v1 使用 Compact List；不使用 Recharts，不用装饰图表替代准确数据。
- **UI-07 Cult UI:** 只保留 Copy -> Check、Dialog/Sheet transition、有限 loading feedback；No Number Ticker。
- **UI-08 QR Payment:** 不使用“请勿关闭页面”；允许用户离开后通过订单权威状态恢复。
- **UI-09 Storybook:** v1 不引入 Storybook；通过行为测试和浏览器视觉检查守住 Foundation。

## Tokens and theme

Tailwind CSS v4 + CSS Variables + semantic tokens 是设计 SSOT。正式支持 Light、Dark、System；首次跟随系统，显式选择只保存非敏感 UI preference。使用 system sans 与 system monospace，不加载外部 Web Font。

颜色必须保持语义：primary、secondary、muted、accent、destructive、border、input、ring 分工明确；active/status 不只依赖颜色。组件圆角以 8px 左右为上限，阴影只用于 overlay 等真实层级。

## Motion

Motion 只使用约 150-250ms 的 opacity/transform transition。支持 `prefers-reduced-motion`。禁止 particles、WebGL、parallax、infinite shimmer/border animation 和大幅 hover translation。

## Accessibility and mobile

- WCAG 2.2 AA baseline、visible focus、semantic landmarks 和正确 headings。
- Icon-only control 必须有 accessible name；不熟悉 icon 提供 tooltip。
- Desktop persistent sidebar；Mobile hamburger + focus-managed Sheet；无 bottom tabs。
- 交互 touch target 接近 44 x 44 px，长文本不能破坏布局。

## Performance budget

- Initial JS gzip target <= 200 kB，hard ceiling 约 250 kB。
- Initial CSS gzip <= 60 kB。
- Normal feature chunk 尽量 <= 100 kB gzip。
- 优先 route-level splitting；未证明必要前不引入 analyzer、大动画库或大组件套件。
