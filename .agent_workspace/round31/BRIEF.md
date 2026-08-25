# Round 31 任务书

- **时间**: 2026-08-25
- **前置**: Round 30 BRIEF（224 files / 2006 tests；HEAD `95e67d3`）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **状态**: 已集成，验证中

## 相对 Round 30 的真实剩余缺口

| 槽位 | 真实缺口 | 禁止 |
| --- | --- | --- |
| R31-fable-arch | `ProjectGrid.tsx` 空状态 `MapPinned` 未钉（父 span 已 hidden） | 不改 StudioUi 兜底测；不引入 Playwright |
| R31-fable-sota | `ContinueEditingCard.tsx` `History` 未钉（父 span 已 hidden） | 不改 ProjectCard 已 pinned 的菜单图标 |
| R31-opus-layout | 连接线搜索**跑过**的路径尚未锁 leftover `side === sideOf`（R30 测的是 skipped-no-geography / grid） | 禁止改 `repairPlacement` `side: "right"`；禁止第二列；禁止改 pack 几何 |
| R31-opus-data | `import-data.ts` 缺 Word 直排冒号 `︰` U+FE30（及可选 `︓` U+FE13）；文件已 400 行须压注释 | 禁止 `·`；禁止 ASCII `:` `/`；禁止把 `ldquo` 当空格 |
| R31-gpt-server | `clientIp` 剥 `::ffff:` 后若剩余 `cb00:7109` 两段十六进制，不会还原成点分 IPv4 | 禁止发明 CF-Connecting-IP；禁止改 XFF 跳数顺序 |
| R31-gpt-perf | cache-key 已做；只查 cache/worker/`layout-perf` 新的测得赢 | 禁止重写 pack；禁止重试 nearestValues / cache-key |

## 落地（验证前）

| 槽位 | 结果 |
| --- | --- |
| R31-fable-arch | ProjectGrid 空状态 MapPinned 钉 `aria-hidden`；新测试 |
| R31-fable-sota | ContinueEditingCard History 钉 `aria-hidden`；新测试 |
| R31-opus-layout | 搜索路径 leftover side 锁；非法 repair 提前结束插入序 |
| R31-opus-data | CELL_DELIMITERS 增加 `︓` `︰`；文件仍 400 行 |
| R31-gpt-server | `::ffff:H:L` 十六进制映射还原为点分 IPv4 |
| R31-gpt-perf | worker hook 去掉重复 LRU get/set（cache 路径测得 −65%） |

## 共享约束

- 回复第一行必须是 `MODEL_SLUG: <slug>`。
- 禁止 git commit / stash / checkout / push / 新分支。
- 实现文件 ≤400 行（静态目录除外）。
- 根 `tsc --noEmit` 是 solution no-op；用 `-p tsconfig.app.json` / `tsconfig.node.json`。
- 支付/套餐不得进入仓库。
- 报告写到 `.agent_workspace/round31/<slot>.md`。
