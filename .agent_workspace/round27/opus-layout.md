MODEL_SLUG: claude-opus-5-thinking-high-fast

# R27 opus-layout — slotPlacements 边缘座位去重

## 改动内容

`slotPlacements` 的无 slot 兜底原本内联了一份 margin clamp（`clampX`/`clampY` + `sideOf`），与 `card-layout-pack.ts` 里 `marginSeat` 的实现逐字重复。现改为直接调用共享的 `marginSeat`，两条 leftover 路径从此只有一处实现。

## Files changed

- `src/lib/card-layout-saturation.ts`
  - 从 `./card-layout-pack` 追加导入 `marginSeat`（该模块已导出，本文件已在导入 `readingOrder`、`overlapPairs`）。
  - 兜底分支由 8 行内联 seat 构造收敛为 `return seated ?? marginSeat(card, space);`。
  - `slotPlacements` 的文档注释同步指向 `marginSeat`，保留“不能硬编码 side、角落座位通常在地图中心左侧或上方”的理由说明。
- `src/lib/card-layout-saturation.test.ts`
  - 新增用例 `seats a slotless card exactly where every other leftover path seats it`：用一张超出画布的大卡（2000×1800，走满 clamp 路径）断言 `slotPlacements([], [orphan], standardBoard)[0]` 与 `marginSeat(orphan, standardBoard)` 全等（`toEqual`，覆盖 x/y/side 及全部透传字段），未来若有人把 clamp 重新内联并写歪就会失败。

行为等价性：`marginSeat` 返回 `{ ...card, x: clampX(margin, width), y: clampY(margin, height), side: sideOf(seat) }`，与被删除的内联代码字面一致，无行为变更、无回滚风险。

## 约束遵守

- 只改了这两个文件。
- `card-layout-saturation.ts` 行数 **374**（原 382，≤400）。
- 未触碰 `stackAtMargin` clamp / 第二列、optimizer `repairPlacement` 的 `side:"right"`、`layeredPack` cascade overlap policy。
- 未执行任何 git commit/stash/checkout/push/branch。

## 验证证据链（failure → cause → fix → recheck）

本轮未出现失败，链条为一次通过：

1. **failure**：无。指定的三个测试文件首次运行即全绿。
2. **cause**：n/a —— 改动是行为等价替换，新断言在改后实现下天然成立。
3. **fix**：n/a。
4. **recheck**：
   - `npx vitest run src/lib/card-layout-saturation.test.ts src/lib/card-layout-pack.test.ts src/lib/card-layout-modes.test.ts` → **3 files passed / 53 tests passed**（其中含新增的 1 条）。
   - `npx eslint src/lib/card-layout-saturation.ts src/lib/card-layout-saturation.test.ts` → 无输出、exit 0。
   - `npx tsc --noEmit -p tsconfig.json` → 无输出、exit 0。

## 验收方式

PR diff review + 上述三个 vitest 文件在 CI 中通过。非破坏性变更（无数据、导出格式或 API 形状改动）；如需回滚，还原这两个文件的 diff 即可，无迁移步骤。
