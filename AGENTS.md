# Aureole Agent Instructions

## AI Development Workflow v1

ChatGPT 负责需求、产品、架构、任务拆解、风险判断和最终技术裁决；Codex 负责代码实施、调试、测试和工程执行；Gemini 仅在独立复核有价值且由上游判断需要时参与。

任何非简单修改必须先阅读现有实现、适用文档和 `git status`，再做最小正确修改。保留用户已有改动，不执行破坏性 Git 操作。结论必须区分已验证、未验证和已有失败。

## Repository boundary

- 只允许写入 Aureole 仓库。
- `solution` 仓库只读；其 `docs/API-CONTRACT.md` 是 Public Contract 的上游 SSOT。
- Aureole 只依赖 solution `/api/v1`，禁止直接调用 V2Board route、依赖原始 DTO、持有 V2Board Secret 或建立跨仓库隐式依赖。
- 不得为了前端便利修改 solution Contract；需要 Contract 变化时必须升级并等待上游决策。
- Aureole 是无业务状态的 SPA；订单、支付、订阅、钱包等业务状态由上游系统持有。

## Source and state boundaries

- 使用 feature-first 组织业务代码；不要演化成巨大的 `pages/`、`services/`、`hooks/`、`utils/` 公共目录。
- TanStack Query 管理 server state；TanStack Router 管理 URL state；React local state 管理局部 UI state。
- Zustand 仅用于 Auth 或少量跨组件 client state，禁止复制 server state。
- React Hook Form 与 Zod 用于后续表单和输入边界；不要为证明依赖存在创建假表单。
- Provider 必须职责单一，不得承载业务状态。

## Sensitive data

Bearer Token、Subscription Access URL、Gift Card Code、Withdrawal Account、Payment Payload 禁止进入 `console.log`、analytics、error-reporting metadata 或 persistent local cache。禁止记录完整 request body、Authorization Header、订阅 URL query 或上游原始响应。

仓库不得包含 Secret、生产 Token、生产 API 地址或 V2Board credential。公开的 `VITE_API_BASE_URL` 只能来自环境配置。

## Escalation

以下情况必须停止并说明影响，不得静默扩大范围：

- 需要修改 solution Contract、V2Board、公开接口或冻结架构；
- 需要引入新的持久化、后端服务、Secret、生产部署或 provider-specific hosting；
- 发现 Auth、Payment、Wallet/Gift Card、Commission/Withdrawal、Subscription Mutation 的安全或一致性风险；
- 需要自动 retry 非幂等 mutation，或无法确定 mutation 是否已成功；
- 需要添加大依赖、替换 package manager 或突破性能预算；
- 仓库状态与任务前提不符，或存在无法安全保留的未知修改。

## Validation

提交前按风险运行直接相关的测试。Foundation 基线至少包括：

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
```

新增 UI 需检查 keyboard/focus、桌面与移动布局、Light/Dark/System、reduced motion 和长文本。新增 API client 行为需覆盖 success、public error、network/malformed response；不得调用生产 API。
