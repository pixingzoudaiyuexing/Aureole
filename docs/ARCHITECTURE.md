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

`_public` 提供 `/login`、`/register`、`/forgot-password`。`_app` 提供 authenticated app 的长期路由骨架，但 Milestone 2 不做假 Auth 判断或 Route Guard。`/` 临时 redirect `/login`；Milestone 3 将根据真实 Auth State 决定 `/login` 或 `/dashboard`。

TanStack Router 插件启用 route-level auto code splitting；生成的 `src/routeTree.gen.ts` 提交到 Git，业务 route 产出独立 lazy chunk。

## API client

`src/lib/api` 使用 native `fetch` typed wrapper，集中处理 base URL、JSON、public envelope、HTTP status、requestId、network error 与 malformed response。路径必须以 `/api/v1/` 开头。业务分类只能依据 `ApiError.code`，禁止 `message.includes(...)`。

`VITE_API_BASE_URL` 是公开 solution Origin，不是 Secret。当前 Auth future boundary 不包含登录请求、Bearer persistence、`/me` bootstrap、logout 或 guard。Milestone 3 计划仅在 `sessionStorage` 持久化 opaque bearer；不得使用 `localStorage`。

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
