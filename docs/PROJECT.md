# Project

## What

Aureole 是一个现代、轻量的用户自助账户门户，以 React SPA 提供订阅、订单、支付、资源、钱包、支持和推荐等 v1 体验。

## Why

Aureole 将浏览器体验与 V2Board 实现细节隔离。前端只理解稳定、最小化的 solution Public DTO 与错误码，从而获得可维护的 UI、清晰的安全边界和可独立演进的产品体验。

## Product position

Aureole 是已登录用户的高信任自助门户，不是后台管理系统、营销站或 V2Board 皮肤。它优先保证账户任务清晰、财务操作审慎、状态可核对和移动端可用。

## Goals

- 对 v1 范围提供一致的 Desktop / Mobile 用户体验。
- 只通过 solution `/api/v1` 获取公开 DTO 和执行受控操作。
- 保持认证、支付、订阅变更与财务流程的显式安全边界。
- 以 feature-first 结构支持逐 Milestone 实现和测试。
- 可作为静态 SPA 安装、开发、测试、构建和部署。

## Non-goals

- 不直接访问、代理或复刻 V2Board API 与业务逻辑。
- 不在浏览器或新后端中保存服务器业务状态。
- 不持有 V2Board Secret 或支付回调。
- v1 不包含 Marketing Homepage、Public Plans、Public Resource Status、Storybook、PWA 或 SSR。
- 本 Foundation 不实现任何完整业务功能。

## Repository boundary

Aureole 是唯一可写仓库。`solution` 是只读上游 Gateway；其 `docs/API-CONTRACT.md` 是 method、path、DTO 和 public errors 的最终 SSOT。前端需求若超出现有 Contract，必须先升级，不能在 Aureole 中绕过 Gateway。

## System relationship

```text
User -> Aureole React SPA -> solution Cloudflare Workers Gateway -> V2Board
```

Aureole 不认识 Gateway 的 Adapter target，不解析上游原始 DTO，不向 V2Board 发送请求。solution 负责 Contract、验证、映射、字段过滤和错误规范化；V2Board 持有最终业务状态。
