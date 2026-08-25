# Round 32 任务书

- **时间**: 2026-08-25
- **前置**: Round 31 BRIEF（226 files / 2024 tests；HEAD `5e102eb`）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **状态**: 进行中

## 相对 Round 31 的真实剩余缺口

| 槽位 | 真实缺口 | 禁止 |
| --- | --- | --- |
| R32-fable-arch | 项目工作台无 skip-link（编辑器/设置页已有 `SkipToStageLink`） | 不改 StudioUi 兜底测；不引入 Playwright |
| R32-fable-sota | `UniversityEmblem` 在占位/失败时 `aria-hidden` 掉整个 `role="img"`，校徽名称进不了 AT | 不改 emblem 懒加载网络行为 |
| R32-opus-layout | `solveCardLayout` 出口没有最后一遍 `side = space.sideOf(placement)` 不变量 | 禁止改 `repairPlacement` seed；禁止第二列；禁止改 pack 几何 |
| R32-opus-data | HTML 仍缺 `&MediumSpace;`（U+205F） | 禁止 `·`；禁止 ASCII `:` `/`；禁止 ldquo→空格；`import-data.ts` 已 400 行勿扩 |
| R32-gpt-server | `host-validation` 与 `clientIp` 各写一套 `::ffff:` 十六进制解析，会漂 | 禁止发明 CF-Connecting-IP；禁止改 XFF 跳数顺序 |
| R32-gpt-perf | cache-key / worker LRU 已做；只查新的测得赢 | 禁止重写 pack；禁止重试 nearestValues / cache-key / worker LRU |

## 共享约束

- 回复第一行必须是 `MODEL_SLUG: <slug>`。
- 禁止 git commit / stash / checkout / push / 新分支。
- 实现文件 ≤400 行。
- 根 `tsc --noEmit` 是 no-op；用 `-p tsconfig.app.json` / `tsconfig.node.json`。
- 支付/套餐不得进入仓库。
- 报告写到 `.agent_workspace/round32/<slot>.md`。
