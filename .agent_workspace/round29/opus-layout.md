MODEL_SLUG: claude-opus-5-thinking-high-fast

# R29 opus-layout — 固定卡片入口统一到 LayoutSpace.sideOf

## 变更

`planPinnedCards` 原先直接调用 `sideForPlacement(area, normalized.map)` 决定固定卡片的 `side`；
现在构造一个 `LayoutSpace(normalized)`，改用 `space.sideOf(area)`，与其余所有 placement 走同一个入口。
`sideForPlacement` 的直接 import 已移除（该文件不再使用它）。

`LayoutSpace` 采用惰性构造（`space ??= new LayoutSpace(normalized)`，在遇到第一个固定卡片时才建）：
构造函数会建立 zone/polygon 索引与 raster，若在有 `fixedPositions` 但无实际命中（如 `{}`）时提前构造，
会在每次 solve 上白白付出一次 raster 构建成本。全函数最多构造一个实例。

### 等价性（非几何改动）

`LayoutSpace` 构造函数执行 `this.bounds = normalizeBounds(bounds); this.map = this.bounds.map`，
而 `normalizeBounds` 对已归一化的 bounds 是幂等的，因此
`space.sideOf(area) === sideForPlacement(area, normalized.map)` 恒成立。

### 未触碰（按约束）

- 固定卡片的 x/y 仍原样透传（含画布外坐标），无 clamp。
- `stackAtMargin` clamp / 第二列：未触碰。
- optimizer `repairPlacement` 的 `side: "right"`：未触碰。

## 文件改动

| 文件 | 说明 |
| --- | --- |
| `src/lib/card-layout-pinned.ts` | 改用 `space.sideOf(area)`，惰性构造 LayoutSpace，去掉 `sideForPlacement` import |
| `src/lib/card-layout-pinned.test.ts` | 新增，4 条用例 |

`src/lib/card-layout-pinned.ts` 行数：**107**（限制 ≤400）。

## 新增测试（`src/lib/card-layout-pinned.test.ts`）

1. **固定卡片的 side 等于 `new LayoutSpace(bounds).sideOf(area)`** —— 五个固定点（map 四侧各一个 + 一个画布外点），
   逐个与测试内独立构造的 `LayoutSpace` 比对；并断言前四个点覆盖 `left/right/top/bottom` 四个不同 side，
   避免"所有点都落在同一侧"导致断言空转。
2. **x/y 保持调用方坐标（含 margin 之外的点）** —— 含 `{ x: -40, y: 12 }`，与既有 `solveCardLayout`
   "even off the canvas margin" 用例同一坐标；同时断言 `plan.free` 为空。
3. **带 `occupiedPolygons` 时同样一致** —— 覆盖 LayoutSpace 构造函数走 raster 分支的路径。
4. **无固定卡片时返回 null** —— `undefined` / `{}` / 不存在的 id / NaN 坐标，四种情形；
   守住惰性构造没有破坏 "nothing pinned → null" 契约。

## 验证证据链（failure → cause → fix → recheck）

1. **要求的命令**
   `npx vitest run src/lib/card-layout-pinned.test.ts src/lib/card-layout.test.ts`
   → **2 files / 75 tests passed**，一次通过，无失败。

2. **failure → cause → fix → recheck（类型检查环节）**
   - failure：`npx tsc --noEmit -p tsconfig.json` 退出码 0 但**零输出**，不可信。
   - cause：根 `tsconfig.json` 是 solution 文件（`"files": []` + references），实际未检查任何文件。
   - fix：改用真实工程 `tsconfig.app.json`。
   - recheck：`npx tsc --noEmit -p tsconfig.app.json` → exit 0，无诊断。

3. **回归面**
   `npx vitest run` 覆盖全部 8 个 card-layout 相关测试文件
   （pinned / card-layout / space / pack / modes / optimizer / cache / saturation）
   → **8 files / 144 tests passed**。既有的 pin 用例（含 "even off the canvas margin"、
   "is deterministic and still solves when every card is pinned"）全部保持通过。

4. **Lint**
   `npx eslint src/lib/card-layout-pinned.ts src/lib/card-layout-pinned.test.ts` → 无输出，exit 0。

## 交付与回滚

- 验收方式：CI 上的 `npm test` + `npm run lint`；本地已跑上述目标测试与全量 card-layout 套件。
- 破坏性风险：无。`side` 取值逐点等价于改动前，导出格式、API 形状、数据均未变。
- 回滚方案：`src/lib/card-layout-pinned.ts` 中把 `space.sideOf(area)` 换回
  `sideForPlacement(area, normalized.map)` 并恢复 geometry import，删除新测试文件即可，
  两处改动互不依赖。

## 说明

按指令未执行 git commit / push；改动留在工作区，分支 `cursor/agent-sota-polish-cbcd` 未变动。
