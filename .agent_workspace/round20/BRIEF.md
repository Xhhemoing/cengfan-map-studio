# Round 20 任务简报（进行中）

- **前置**: Round 19 已验证：tsc 绿、eslint --max-warnings 0、211 files / 1853 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `layoutGrid` 用自制左右判定 `x + width/2 >= map.centerX ? "right" : "left"`，**从不**标 top/bottom，且用的是 clamp 前的格子坐标。宽浅地图上边距格会被标成 left/right，连接线方向错。应在 clamp 后 `space.sideOf(area)`。
2. `useCollaborationRoom.ts` 又写了一份 `loadBrowserValue`，与 `app-initialization.ts` 重复。
3. `ProjectMenu.tsx`、`workbench/WorkbenchHeader.tsx` 里带可见文字的按钮，Lucide 图标没有 `aria-hidden`。
4. 禁止 Playwright、支付、CMYK、拆 china-universities。实现文件 ≤400。不要改 stackAtMargin clamp 堆底。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R20-fable-arch | `src/lib/useCollaborationRoom.ts` 及相关测试。删除本地 `loadBrowserValue`，改 import。禁止改 pack。 |
| R20-fable-sota | `src/components/ProjectMenu.tsx`、`src/components/workbench/WorkbenchHeader.tsx`、对应测试。装饰图标 aria-hidden。 |
| R20-opus-layout | `src/lib/card-layout-pack.ts` + 测试。`layoutGrid` 用 sideOf。pack.ts ≤400。禁止 cache。 |
| R20-opus-data | import-data 找另一处静默错（如全角数字序号）；没有则诚实跳过并写明搜过什么。保持 ≤400。 |
| R20-gpt-perf | bench。无 CI 时限。诚实跳过也可。 |
| R20-gpt-server | `server/**` 找一个真实洞；没有则诚实跳过。index.ts ≤400。 |
