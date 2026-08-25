# Round 2 · opus-fast-2：测试拆分、properties 几何、文案诚实、scene-document 挤行

**模型 slug：** `claude-opus-5-thinking-high-fast`
**分支：** `cursor/display-frame-layout-d264`（未 commit / 未 push，按任务要求）
**承接遗留缺陷：** D1（`modes.test.ts` 469 行未登记）、D4（properties 遇非 solved 就 skip）、D6（`scene-document.ts` 两字段挤一行），外加文案诚实。

---

## 1. `modes.test.ts` 压回 ≤400 行

| 文件 | 改前 | 改后 |
| --- | --- | --- |
| `src/lib/card-layout.modes.test.ts` | 469 | **276** |
| `src/lib/card-layout.modes-extra.test.ts`（新建） | — | **217** |

搬走的是 Round 1 新增的 6 个用例 + 它们专用的两个 helper（`straightCrossings`、`anchorDistance`）：

1. `proximity mode parks every card far closer to its anchor than a naive dump`
2. `columns mode packs two anchor-ordered columns against the map edges`
3. `columns mode moves the split line to even out the two columns when auto-balancing`
4. `never ships crossing connectors when a crossing-free arrangement exists`
5. 交叉无解降级用例（见第 4 节，本轮重写）
6. `treats element areas as obstacles unless element overlap is allowed`

留在 `modes.test.ts` 的是改动前就存在的用例；`it.each` 的 mode 列表仍含 `proximity` / `columns`（Round 1 是就地扩列表，不是新增用例，拆走会掉覆盖）。同时删掉了随搬走用例一起失效的 `CardArea` / `CardPlacement` 类型导入与 `overlaps` fixture 导入。

**用例数守恒验证：** 拆分前 `npx vitest run src/lib/card-layout.modes.test.ts` = 27 passed；拆分后两文件合计 = 27 passed（第 5 节改写后仍为 27）。没有用例在搬运中丢失。

ratchet 现在只剩 `src/lib/card-layout.ts` 一项，`modes.test.ts` 不再出现在「未登记超 400」列表。**新文件已 `git add -N`**，因此 ratchet 的 `git ls-files` 能看见它并确认 217 ≤ 400（未 commit）。

## 2. properties：180 种子不论 status 都校验几何

`src/lib/card-layout.properties.test.ts`（225 → 264 行）：

- 第一条 property 删掉 `if (result.status !== "solved") continue;`，**margin / 卡卡 gap / occupiedAreas / occupiedPolygons 四类几何硬约束对全部 180 个种子无条件生效**。改前只覆盖 107 个种子。
- 循环后加 `expect(solved).toBeGreaterThan(0)`，防止「全部降级」时几何扫描空转还显示绿。故意不写 `solved < 180` 之类的上界，否则 opus-1 把交叉修好之后这条会反过来变红。
- 新增第二条 property `ships zero connector crossings on every seed it calls solved`：只在 `status === "solved"` 时用 `connectorGeometriesIntersect`（与求解器同一个谓词、同一个 `clearance = connectorWidth`）逐对断言 0 交叉，并用 `expect(checked).toBeGreaterThan(0)` 防空跑。这就是任务说的「crossings 只在 solved 时要求 0」。
- 第四条 `keeps the full gap between cards placed by the containment repair scan` 里同样的 `if (status !== "solved") continue` 也删了，并补上 occupiedAreas 断言。

**改前先量过，不是碰运气：** 临时探针（跑完即删）对 180 个种子统计得 `{"solved":107,"fallback":73}`、**几何违例 0 处**。原因是 `solveCardLayout` 对每个 attempt 先看几何：几何过但有交叉 ⇒ 直接以 `fallback` 出货；几何不过才换下一个 attempt。所以 `fallback` 的落点几何一定合法，唯一可能违反几何的是「所有 attempt 几何都不过」的 `firstProduced` 兜底，而这 180 个种子里不存在。

## 3. `scene-document.ts` 两字段分行，仍是 766 行

三处全部拆开（类型声明、默认值、normalize），共 +3 行；对应回收 3 行：

| 回收点 | 手法 |
| --- | --- |
| import 段后的连续两个空行 | 删掉多余的那个（全文件唯一一处 double-blank） |
| `normalizeScene` 的 `cards` 字面量里 `showProvinceTexture` 与 `displayFrame` 之间的空行 | 删掉 |
| `preset: "compact"` 归一化的两行中文注释 | 合并成一行，语义不变 |

`wc -l` = **766**，与 allowlist 记录值一致（ratchet 既不许涨也不许悄悄缩）。

## 4. 文案诚实

Round 1 其实并没有写下「所有算法连接线都不交叉」这句话——它压根没在用户可见文档里提过交叉。所以本轮不是删夸大表述，而是**把这件事如实补上**，避免用户看到交叉以为是 bug。

三处措辞一致，核心是「当硬性要求去搜索 + 不保证做到 + 排不开时保留它找到的交叉最少的一版 + 需要刷新 / 换算法 / 手调」：

- `src/components/inspector/CardsInspector.tsx`：在「排布方式 / 自动平衡左右」下方新增一条 `property-panel__hint`。
- `USER_GUIDE.md` 2.1 新增「**连接线交叉**」条目。
- `CHANGELOG.md` Unreleased 的排布方式条目补一句，并明写「这不是『所有算法都不会交叉』的承诺」。

刻意没写「找得到不交叉的排法就一定不交叉」：`chooseLayout` 只按偏好顺序试有限个 attempt，不是穷举，fable-1 的架构评审也把强承诺限定在 ≤80 卡。写成全称命题就是新的夸大。

`CardsInspector.test.tsx` 原本不断言任何 hint 文本，所以没有因文案变化变红；我在既有的 `switches layout modes...` 用例里补了两条 `toContain` 断言（`"当硬性要求去搜索，但不保证"` / `"交叉最少的一版"`），把「不许改回全称承诺」钉住。

## 5. 与 opus-1 并发改动的一次 failure → cause → fix → recheck

跑最终验证时 `card-layout.modes-extra.test.ts` 的降级用例突然红了。

1. **failure：** `reports a fallback with the fewest crossings instead of throwing when none is crossing-free` — `expected 'solved' to be 'fallback'`。
2. **cause：** opus-1 本轮的 D2 修复在这期间落地（`card-layout.ts` 2016 → 288 行，新增 `card-layout-uncross.ts` 等 10 个模块）。这个 6 卡 `grid` + straight 的场景现在真的能被拆线修复到 0 交叉，所以 `solved` 是**正确且更好**的结果，是 Round 1 的断言过期了，不是新 bug。
3. **fix：** 不放宽、也不改回去，改成写死不了的契约（用例改名 `degrades to the fewest crossings instead of throwing, and never calls a crossing layout solved`）：
   - `status === "solved"` **当且仅当** `straightCrossings === 0`（求解器再变强也成立，求解器说谎则立刻红）；
   - 开启约束后的交叉数 **≤** `forbidConnectorCrossing: false` 时的交叉数（约束不许把结果改差）；
   - 全部卡片仍在、几何硬约束仍成立、不抛。
   另加一块 16 卡密板一起跑同样的契约，覆盖拆线修复真正吃力的区间。
4. **recheck：** `npx vitest run src/lib/card-layout.modes-extra.test.ts` → 6 passed。

**顺带量到的边界（留给 Round 3，不是我改的）：** 同一块板子 18 卡时 `grid` / `proximity` 会走到「所有 attempt 几何都不过」的 `firstProduced` 兜底，返回 `fallback` 且**卡片之间真的重叠**（grid 15 对、proximity 6 对，quadrant 0 对）。这与 `docs/PROJECT_REQUIREMENTS.md`「极端密集场景优先保证内容不丢失和不越界」一致，属既有设计而非本轮回归；但 UI 目前不会告诉用户「这一版是压着放的」。所以我的密板用例卡在 16 卡（该画布还放得下的最大值），并在注释里写明 18 卡会翻过饱和悬崖。

另外中途有一次跑到 opus-1 存盘瞬间，`card-layout-uncross.ts` 的 `scoreMoves` 抛 `TypeError: Cannot read properties of undefined (reading 'fill')`，几秒后再跑即消失，是写入中间态，未在最终结果中复现。

## 6. 验证

指定命令：

```
npx vitest run src/lib/card-layout.modes.test.ts src/lib/card-layout.modes-extra.test.ts \
  src/lib/card-layout.properties.test.ts src/lib/scene-document.test.ts \
  src/components/inspector/CardsInspector.test.tsx scripts/file-size-ratchet.test.ts
```

**结果：71 个用例 70 passed / 1 failed。** 唯一红的是 ratchet 的

```
src/lib/card-layout.ts: now 288 lines, at or under the limit — delete this entry
```

即 opus-1 拆完 `card-layout.ts` 之后 `scripts/file-size-allowlist.json` 里那条记录已经过期、需要在同一提交里删掉。allowlist 与 `card-layout.ts` 都不在我的所有权范围，**留给 opus-1 收尾**。ratchet 的另外两条（「未登记超 400」「allowlisted 文件变大」）都已转绿——`modes.test.ts` 与新建的 `modes-extra.test.ts` 都不在任何超限名单里，`scene-document.ts` 也没涨。

补充验证：

- `npx eslint`（本轮全部改动文件）→ 干净。
- `npx tsc -b --noEmit` → 干净。
- 邻接回归 `ReferenceCardStyleWorkspace.test.tsx` / `project-migration.test.ts` / `project-document.test.ts` / `canvas-edit-transactions.test.ts` / `editor-canvas-actions.test.ts` → 71 passed。
- 真实浏览器（headless Chrome 驱动 `npm run dev:web`，打开示例项目 → 「版式」阶段）确认新 hint 真的渲染在「自动平衡左右」与「禁止遮挡地图」之间，文案与源码一致；同一截图里海报的连接线确实还有交叉，佐证这段文案没有说过头。

## 7. 交付与回滚

- **验收方式：** 上面那条 vitest 命令 + `npm run lint` + 浏览器打开「版式」阶段看右栏 hint。
- **破坏性变更：** 无。没动数据结构、导出格式或 API 形状；`scene-document.ts` 只是把同一行的两个字段换行，序列化结果逐字节相同。
- **回滚：** 三块互不依赖，可单独 revert——(a) 测试拆分（删 `card-layout.modes-extra.test.ts`、还原 `modes.test.ts`）；(b) properties 断言收紧（还原两处 `continue`、删新增 property）；(c) 文案（还原 hint / CHANGELOG / USER_GUIDE 三处 + `CardsInspector.test.tsx` 两条 `toContain`）。

## 8. 未做 / 交还

- `scripts/file-size-allowlist.json` 里 `src/lib/card-layout.ts` 的过期条目——归 opus-1（D1）。
- 18 卡饱和时 `fallback` 输出重叠卡片、UI 无提示——建议 Round 3 决定要不要按 `status === "fallback"` 给用户可见提示；opus-1 的 Round 1 报告已指出 `grid` / `right-stack` 在有连接线时几乎常亮 fallback，因此提示不宜做成全局常亮。
