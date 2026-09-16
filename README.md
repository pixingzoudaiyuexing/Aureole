# Aureole

Aureole 是面向最终用户的账户与订阅管理 React SPA。浏览器只通过 `solution` 的稳定 `/api/v1` Public Contract 访问服务，不直接依赖或调用 V2Board。

## Requirements

- Node.js 22.12 或更高版本
- npm（仓库唯一 package manager）

## Quick start

```bash
npm ci
cp .env.example .env.local
npm run dev
```

**关于 API Base URL：**

- 默认情况下（Same-origin 模式）不需要设置 `VITE_API_BASE_URL`，应用会自动使用与前端相同的 Origin 发送 `/api/v1/*` 请求。
- 仅在需要显式跨域调试或特定独立部署时，才在 `.env.local` 中取消注释并设置 `VITE_API_BASE_URL`。
- 该变量是公开的浏览器配置，非 Secret。
- 它绝不能直接指向 V2Board 后端。
- 生产环境的跨域 Origin 必须是合法的 HTTPS 地址，并遵守 Origin-only 限制。

## Commands

```bash
npm run dev          # local development
npm run preview      # preview a production build
npm run typecheck    # TypeScript project check
npm run lint         # ESLint
npm test             # Vitest once
npm run build        # normal development/validation build
npm run build:release # clean deployable exact-SHA release artifact build
npm run format       # write Prettier formatting
npm run format:check # verify formatting
```

## Architecture

- [Project](docs/PROJECT.md)
- [Product scope](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [UX and information architecture](docs/UX-IA.md)
- [API mapping](docs/API-MAPPING.md)
- [Design constraints](docs/DESIGN-CONSTRAINTS.md)
- [Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [Status](docs/STATUS.md)

Cloudflare Pages staging is verified for the documented explicit SPA routes, static assets, `/api/v1` Functions boundary, cache/security headers and rollback. Production deployment remains a separate owner-authorized operation; Aureole v1 launch readiness does not mean production has been deployed.
