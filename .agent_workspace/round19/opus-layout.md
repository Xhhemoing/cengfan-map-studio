MODEL_SLUG: claude-opus-5-thinking-high-fast

# Round 19 — R19-opus-layout: `orderResult` 的 `space` 收口为必填

## 结果

Round 18 把「求解器丢了 id」的回落从 `{ x: 0, y: 0, side: "right" }` 改成了边距座位，但为了避开同轮路径隔离，`space` 只做成**可选**参数，原点分支作为无 `space` 时的旧行为保留了下来。本轮把这个过渡态收掉：`space: LayoutSpace` 必填，原点分支删除。

现在 `orderResult` 的每一条出口都落在内边距以内，`side` 一律由 `space.sideOf(seat)` 现算——画布外座位这个形状在类型层面已不可表达。

| 文件 | 变更 |
| --- | --- |
| `src/lib/card-layout-pack.ts` | `space?: LayoutSpace` → `space: LayoutSpace`；删除 `?? { ...card, x: 0, y: 0, side: "right" as CardSide }` 分支；回落收敛为单表达式 `?? marginSeat(card, space)`；doc 注释重写（**399 行**，未超 400） |
| `src/lib/card-layout-pack.test.ts` | 删除 `"keeps the legacy origin seat when no space is available to measure"`（388 行，17 用例） |

**没有任何调用点需要修改。** 五处 `orderResult` 调用早已全部传入 `space`：

| 调用点 | 行 |
| --- | --- |
| `card-layout.ts` | 154（repack）、270（grid）、278（packSides） |
| `card-layout-optimizer.ts` | 345 |
| `card-layout-pinned.ts` | 93（`new LayoutSpace(plan.bounds)`） |
| `card-layout-pack.ts` 模块内 | 310（`sweepPack`）、347（`shelfLayout`） |

`stackAtMargin` 的 clamp-to-maxY（`y: space.clampY(y, placement.height)`）**未触碰**，不在 diff 内。

## 变更内容

```ts
// 修复前
export function orderResult(cards, placements, space?: LayoutSpace): CardPlacement[] {
  // ...
  return cards.map((card) => byId.get(card.id)?.shift()
    ?? (space ? marginSeat(card, space) : { ...card, x: 0, y: 0, side: "right" as CardSide }));
}

// 修复后
export function orderResult(cards, placements, space: LayoutSpace): CardPlacement[] {
  // ...
  return cards.map((card) => byId.get(card.id)?.shift() ?? marginSeat(card, space));
}
```

`CardSide` 的 type import 保留：`layoutGrid`（364 行）仍在用。

## 验证（failure → cause → fix → recheck）

本轮是收口重构而非缺陷修复，「failure」取的是**「必填是否真的被编译器强制」**——否则删掉分支只是删了死代码，签名收紧本身没有约束力。

1. **failure**：临时在 `card-layout-pack.test.ts` 末尾追加两参调用 `const _probe = orderResult([], []);`，`npx tsc -p tsconfig.app.json --noEmit` → `error TS2554: Expected 3 arguments, but got 2`（第 391 行）。
2. **cause**：签名从 `space?: LayoutSpace` 变为 `space: LayoutSpace`，省略实参不再是合法调用；同时 `?? marginSeat(card, space)` 中 `space` 已是非可空类型，无需 `space ?` 守卫。这正是期望的约束——原点座位不再有语法上的入口。
3. **fix**：移除临时探针（`cp /tmp/pack.test.bak` 还原），确认 `git diff --stat src/lib/card-layout-pack.test.ts` 仅剩本轮的 6 行删除。
4. **recheck**：
   - `npx tsc -p tsconfig.app.json --noEmit` → **干净（exit 0）**。这同时是「无调用点遗漏 `space`」的证据：若五处外部/模块内调用中任何一处漏传，必然复现步骤 1 的 TS2554。
   - `npx vitest run src/lib/card-layout-pack.test.ts` → **17 passed**（原 18 减去删掉的 legacy 用例）。
   - 全部 9 个 `src/lib/card-layout*.test.ts`（pack / saturation / optimizer / modes / cache / card-layout / index / space / worker-protocol）→ **9 files / 143 tests passed**。
   - `npx eslint src/lib/card-layout-pack.ts src/lib/card-layout-pack.test.ts` → **干净（exit 0）**，确认删除分支后无遗留未用 import。
   - `wc -l src/lib/card-layout-pack.ts` → **399**，满足 ≤400。

## 交付与回滚

- **验收方式**：CI（tsc + vitest + eslint）+ 上述五项本地检查。按要求**未 commit / stash / push**，改动留在工作区。未触碰 `card-layout-cache.ts`。
- **破坏性**：`orderResult` 是导出函数，第三参数由可选变必填，属于**签名收紧**。仓库内所有调用点已传 `space`（tsc 干净为证），故仓库内无破坏；对仓库外的假想两参调用者是编译期破坏——但该路径产出的正是画布外的原点座位，属于要消除的行为。运行时行为对仓库内所有路径**逐字节不变**：唯一被删的分支在本仓库中不可达。
- **回滚**：`git checkout -- src/lib/card-layout-pack.ts src/lib/card-layout-pack.test.ts`。或手工回退——把参数改回 `space?: LayoutSpace`，回落表达式改回三元式，并恢复那个 legacy 用例。

## 备注

工作区内 `server/security.test.ts` 有一处 `vary: Accept-Encoding` 断言的改动，**非本代理产出**（本代理开工时 `git status` 仅有未跟踪的 `.agent_workspace/round19/`），应属同轮并行代理，未作处理。
