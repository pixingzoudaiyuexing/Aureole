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

`VITE_API_BASE_URL` 是公开的 solution API Origin，不是 Secret。Foundation 页面不会发出真实业务请求。

## Commands

```bash
npm run dev          # local development
npm run preview      # preview a production build
npm run typecheck    # TypeScript project check
npm run lint         # ESLint
npm test             # Vitest once
npm run build        # TypeScript + production build
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

Production hosting must serve `index.html` for unknown application routes so direct navigation and refresh work for paths such as `/orders/123`. No hosting provider is selected yet.
