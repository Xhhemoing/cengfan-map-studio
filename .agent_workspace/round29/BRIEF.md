# Round 29 任务简报（进行中）

- **前置**: Round 28 已验证：tsc 绿、eslint --max-warnings 0、221 files / 1979 tests。HEAD `652ef42`。更早 commit 的 CI 绿是被取代推送，以 HEAD 为准。
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **注意**: 不要回退 `e7783e1`。不要改 `stackAtMargin` 饱和堆叠。不要改 optimizer `repairPlacement` 的 `side: "right"`。不要改手摆卡坐标。不要加 Playwright / 支付 / CMYK。不要拆 china-universities。

## 真实缺口

1. `inspector/MapInspector.tsx`「重置地图」RotateCcw 与图层 ArrowUp/Down/ChevronsUp/Down 未在调用点写 `aria-hidden`。「恢复原始地图」已 hidden。已有 `MapInspector.test.tsx`（含「地图上移」按钮）。默认 mode 不是 placement 时 `showGlobal` 为真。
2. `studio-editor/stage-slots.tsx`「刷新展示框位置」RefreshCw、「返回地图样式」MapPinned 未写 `aria-hidden`（frame 与 content 两处刷新）。用 `buildStageSlots` 渲 `stageActions` 测试，重子树可 mock。可参考 `LegacyEditorChrome.test.tsx` 的 ctx 桩。
3. `card-layout-pinned.ts` 手摆卡 `side` 直接调 `sideForPlacement(area, normalized.map)`；`LayoutSpace.sideOf` 就是同一函数。改为构造一次 `LayoutSpace(normalized)` 后 `space.sideOf(area)`，与其它座位同一入口。禁止改 x/y。文件 101 行。可新建 `card-layout-pinned.test.ts`：钉 `side === new LayoutSpace(bounds).sideOf(area)`，坐标仍是用户给的（含画布外）。
4. HTML 粘贴：`HTML_NAMED_ENTITIES` 已有 emsp/ensp/thinsp/nbsp，缺 Word 表格常用的 `&numsp;`（figure space）与 `&hairsp;`。映成普通空格，走现有 collapse。不要解码曲引号。只改 `html-table-parse.ts` + 其测试。
5. `clientIp` 最终 `.replace(/^::ffff:/, "")` 大小写敏感；`host-validation.ts` 先 `toLowerCase` 再剥。XFF `::FFFF:203.0.113.9` 会原样留下。改为 `/^::ffff:/i`。不要发明 CF-Connecting-IP。
6. 禁止 Playwright、支付、CMYK、拆 china-universities。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R29-fable-arch | `src/components/inspector/MapInspector.tsx` + `MapInspector.test.tsx`。图标 aria-hidden。 |
| R29-fable-sota | `src/components/studio-editor/stage-slots.tsx` + 新/现有测试。ToolbarButton 图标 hidden。 |
| R29-opus-layout | `src/lib/card-layout-pinned.ts` + 测试（可新建）。sideOf 统一。≤400。不改坐标。 |
| R29-opus-data | `src/lib/html-table-parse.ts` + `html-table-parse.test.ts`。numsp/hairsp。 |
| R29-gpt-perf | 诚实跳过也可。禁止改 stackAtMargin clamp / repairPlacement side。 |
| R29-gpt-server | `server/client-ip.ts` + `server/client-ip.test.ts`。`::ffff:` 大小写不敏感。 |
