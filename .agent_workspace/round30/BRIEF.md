# Round 30 任务书

- **时间**: 2026-08-25
- **前置**: Round 29 BRIEF（223 files / 1991 tests；HEAD `8f6bdcb`）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **状态**: 已集成，验证中

## 相对 Round 29 的真实剩余缺口

| 槽位 | 真实缺口 | 禁止 |
| --- | --- | --- |
| R30-fable-arch | `agent-assistant-conversation-view.tsx` 预览行 Lucide 未钉 `aria-hidden`（父 span 已 hidden） | 不改 `StudioUi` 兜底测；不引入 Playwright |
| R30-fable-sota | `WorkflowGuide.tsx` 流程导航 `<Icon size={16} />` 未钉；现测只查父 span | 不改 stepper 已 hidden 的图标 |
| R30-opus-layout | 门面 `solve()` 对已 `orderResult` 的 `layoutGrid`/`packSides`/`repackAll` 再包一层；`mergePinnedCards` 的 `placed[cursor]!` | 禁止改 `repairPlacement` `side: "right"`；禁止第二列；禁止改 pack 几何 |
| R30-opus-data | HTML 仍缺 Word/HTML5 空格实体 `emsp13`/`emsp14`/`puncsp` | 禁止 `·`；禁止 ASCII `:` `/`；禁止把 `ldquo` 当空格；`import-data.ts` 已 400 行勿扩 |
| R30-gpt-server | `host-validation.ts` loopback 的 `::ffff:` 剥除仍大小写敏感地写在 `toLowerCase` 之后；查 IPv6 zone / 映射回环 Host | 禁止发明 CF-Connecting-IP；禁止改 XFF 跳数顺序 |
| R30-gpt-perf | 仅 cache/worker/`layout-perf` 可测候选；pack.ts 395/400 | 禁止重写 pack；R26–28 nearestValues 已测更慢 |

## 落地（验证前）

| 槽位 | 结果 |
| --- | --- |
| R30-fable-arch | 预览行 AlertTriangle/Check/ShieldCheck 钉 `aria-hidden`；新 conversation-view 测试 |
| R30-fable-sota | WorkflowGuide 导航 Icon 钉 `aria-hidden`；svg 断言 |
| R30-opus-layout | 门面去掉冗余 orderResult；mergePinnedCards 显式 marginSeat 兜底 |
| R30-opus-data | HTML `&emsp13;`/`&emsp14;`/`&puncsp;` → 空格 |
| R30-gpt-server | 回环 Host `[::FFFF:127.0.0.1]`（URL 规范化成 `::ffff:7f00:1`）现放行 |
| R30-gpt-perf | cache-key 改为位置数组序列化（测得 key 构建 p50 −0.81%/−1.24%） |

## 共享约束

- 回复第一行必须是 `MODEL_SLUG: <slug>`。
- 禁止 git commit / stash / checkout / push / 新分支。
- 实现文件 ≤400 行（静态目录除外）。
- 根 `tsc --noEmit` 是 solution no-op；用 `-p tsconfig.app.json` / `tsconfig.node.json`。
- 支付/套餐不得进入仓库。
- 报告写到 `.agent_workspace/round30/<slot>.md`。
