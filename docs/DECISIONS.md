# Decisions

| ID        | Status   | Decision                                                                                                                                                       |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-AUR-001 | APPROVED | Aureole 使用 React + TypeScript + Vite 静态 SPA。                                                                                                              |
| D-AUR-002 | APPROVED | 只依赖 solution `/api/v1` Public Contract；禁止直接 V2Board coupling。                                                                                         |
| D-AUR-003 | APPROVED | Source architecture 使用 feature-first，route 保持薄层。                                                                                                       |
| D-AUR-004 | APPROVED | TanStack Query 持有 server state；Zustand 不复制 server data。                                                                                                 |
| D-AUR-005 | APPROVED | Auth opaque bearer 仅保存于 memory + `sessionStorage`；`/me` 属于 TanStack Query，local logout/Auth invalidation 清除 credential 与 Query cache。              |
| D-AUR-006 | APPROVED | v1 正式支持 Light + Dark，默认 System Preference。                                                                                                             |
| D-AUR-007 | APPROVED | 部署基线是静态 SPA，并要求 unknown application route -> `index.html` fallback。                                                                                |
| D-AUR-008 | APPROVED | v1 不引入 Storybook；达到真实组件状态需要后续再评估。                                                                                                          |
| D-AUR-009 | APPROVED | Onboarding AntiBot 当前仅支持 `recaptcha` + `v2-checkbox`；mutation 保持 provider-neutral `challengeToken`，V2Board 权威验证，未知 provider/mode fail closed。 |

这些是长期 Architecture / Product 决策。普通依赖补丁、组件样式或局部实现选择不记录为 ADR。
