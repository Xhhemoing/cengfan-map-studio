# Round 1 规格 — 展示框排布重构

父调度器锁定。实现以 `.agent_workspace/PROGRESS.md` 为准。

## 验收（Round 1 最低线）

1. 两个勾选在检查器可切换，且改变 `PosterCanvas` 交给求解器的 `occupiedAreas` / `occupiedPolygons`。
2. `proximity` 与 `columns` 可 `solveCardLayout` 且满足硬约束（画布内、卡片不重叠、按开关避让障碍）。
3. 存在连接线时，能找到 0 交叉解则不得输出交叉；否则 `fallback` 且交叉最少。
4. `adaptCardLayout` 纯函数：移动一张卡后邻居让开，自身耗时应远小于全量 `solve`（探针记录数字）。
5. 旧 `quadrant|radial|right-stack|grid` 单测不无故失败。
6. 工程 JSON round-trip：`allowElementOverlap` + 新 mode。

## 建议模块切分

- `src/lib/card-layout-adapt.ts` — `adaptCardLayout` + 单测
- `src/lib/card-layout.ts` — 类型扩展、`solveCardLayout` 分发、硬约束（交叉）
- 新 mode 的分类/打包可放 `card-layout.ts` 内现有 `classify*`/`placeSide` 旁，避免大爆炸重构

## 测试命令（各实现代理跑自己改过的文件，禁止并行全量）

```
npx vitest run src/lib/card-layout.ts  # 不要对 ts 源跑；对对应 test
npx vitest run src/lib/card-layout.modes.test.ts
npx vitest run src/lib/card-layout.manual-clamp.test.ts
npx vitest run src/components/inspector/CardsInspector.test.tsx
```
