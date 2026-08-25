# Round 32 结论简报

- **时间**: 2026-08-25
- **前置**: Round 31 BRIEF（226 files / 2024 tests；HEAD `5e102eb`）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0`；全量 vitest **226 files / 2037 tests passed**（77.00s）；feat HEAD `179aab2`

## 相对 Round 31

| 代理 | Round 31 | Round 32 |
| --- | --- | --- |
| R32-fable-arch | 工作台空状态 MapPinned hidden | 工作台 skip-link「跳到项目列表」，落点 `workbench-projects` |
| R32-fable-sota | ContinueEditingCard History hidden | UniversityEmblem 占位/失败时保留 `role="img"` + `aria-label` |
| R32-opus-layout | 搜索路径 leftover side 锁 | 出口 `sideForShippedPlacement`：shipped `side` = `space.sideOf` |
| R32-opus-data | CELL_DELIMITERS `︓` `︰` | HTML `&MediumSpace;` / `&ThickSpace;` → 空格 |
| R32-gpt-perf | worker hook 去掉重复 LRU | worker 阈值 24→49（48 卡主线程 p95 < 16.7ms） |
| R32-gpt-server | `clientIp` `::ffff:H:L` 点分还原 | 共享 `normalizeIpv4MappedAddress`；Host `[::ffff:7f00:1]` |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| 无集成失败 | — | 子代理路径隔离；出口 relabel 测试先证 packSides 仍不一致 | tsc 0；eslint --max-warnings 0；226 / 2037 |
| 工作台无 skip-link | 仅编辑器/设置页有 `SkipToStageLink` | 复用组件 + `WORKBENCH_PROJECTS_TARGET_ID` | ProjectWorkbench + ProjectGrid 套件绿 |
| 校徽占位 `aria-hidden` 掉名称 | 宿主 `aria-hidden={!showImage}` | 只藏内部占位，宿主保留 role/img | UniversityEmblem 9 绿 |
| packSides 落座后 side 仍是分栏 | 出口透传 classification | `merged.map(sideForShippedPlacement)` | card-layout 套件绿 |
| `&MediumSpace;` 原样进姓名 | 实体表缺键 | `mediumspace`/`thickspace` → `" "` | html-table-parse 套件绿 |
| Host 与 clientIp 各写一套 mapped 解析 | 无共享模块 | `server/ipv4-mapped.ts` | client-ip + security 绿 |
| 24 卡冷 miss 付 worker 启动 ~21ms | 阈值低于测得的主线程安全区 | 阈值 49 | worker/bench 套件绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
- `hasError && empty` 时 ProjectGrid 渲染空白列表（错误横幅在工作台）。
