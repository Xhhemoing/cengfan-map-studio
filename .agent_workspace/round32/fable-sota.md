# R32-fable-sota — UniversityEmblem 占位态可访问名称修复

- **槽位**: R32-fable-sota（BRIEF：占位/失败时 `aria-hidden` 掉整个 `role="img"`，校徽名称进不了 AT）
- **分支**: `cursor/agent-sota-polish-cbcd`
- **改动文件**: `src/components/UniversityEmblem.tsx`（79 行）、`src/components/UniversityEmblem.test.tsx`（131 行），均 ≤400 行

## 问题

`UniversityEmblem` 宿主 `<span>` 同时设置 `role="img"`、`aria-label={alt ?? `${university}校徽`}` 和 `aria-hidden={!showImage}`。三种占位场景下 `showImage === false`：

1. 视口外（IntersectionObserver 尚未触发，`inView === false`）；
2. 该大学无校徽资源（`universityEmblems[university]` 为 undefined）；
3. `<img>` onError 回退（`failed === true`）。

此时宿主被 `aria-hidden="true"` 整体移出可访问性树，而内部首字占位本身也是 `aria-hidden`，读屏用户完全听不到"浙江大学校徽"这个名称。

## 修复

只删掉宿主上的 `aria-hidden={!showImage}` 一行（并留注释说明为何不能隐藏宿主）。保持：

- 宿主 `role="img"`；
- `aria-label` 对非空 university 恒存在（`alt ?? `${university}校徽``）；
- 内部占位 `<span className="university-emblem__placeholder" aria-hidden>` 不变（视觉首字不参与命名）；
- `<img alt="">`（由宿主命名，避免双重朗读）；
- 懒加载不变：IntersectionObserver（rootMargin 48px）入视口才设置 `src`、`loading="lazy"`/`decoding="async"`、src 路径 `/emblems/<大学>.webp`、onError 回退首字占位，全部未动。

无破坏性变更（不改数据/导出格式/API 形状）；回滚方案 = 恢复宿主上的 `aria-hidden={!showImage}` 单行。

## 新增测试（4 条）

`src/components/UniversityEmblem.test.tsx`：

1. **视口外**：无 `<img>`、占位可见、宿主无 `aria-hidden` 属性、`aria-label === "浙江大学校徽"`。
2. **无校徽大学**（北京航空航天大学北海学院）：`aria-label === "北京航空航天大学北海学院校徽"`、占位 `aria-hidden="true"`、宿主无 `aria-hidden`。
3. **img onError 后**：宿主仍暴露，`aria-label === "浙江大学校徽"`。
4. **图片正常显示时**：宿主 `aria-label` 保留、`img` 的 `alt === ""`。

## 验证纪律证据链（failure → cause → fix → recheck）

1. **failure（复现）**：临时把 `aria-hidden={!showImage}` 加回宿主，跑 `npx vitest run src/components/UniversityEmblem.test.tsx`：

   ```
   Tests  3 failed | 6 passed (9)
   × keeps the accessible name while out of view (host not aria-hidden)
   × keeps the accessible name for universities without an emblem
   × keeps the host exposed with its aria-label after the image errors
   AssertionError: expected true to be false   // emblem.hasAttribute("aria-hidden")
   ```

   三条新占位态测试全部命中 `aria-hidden` 断言（第 4 条"显示图片"用例不断言 aria-hidden，故仍过）。

2. **cause**：`aria-hidden={!showImage}` 在占位态渲染 `aria-hidden="true"`，把带名称的 `role="img"` 宿主整体移出可访问性树。

3. **fix**：删除宿主的 `aria-hidden`，其余（role / aria-label / 占位 aria-hidden / img alt="" / 懒加载）不动。

4. **recheck**：恢复修复后重跑同一命令：

   ```
   Test Files  1 passed (1)
   Tests  9 passed (9)   （原有 5 条 + 新增 4 条）
   ```

## 其他检查

- `npx eslint src/components/UniversityEmblem.tsx src/components/UniversityEmblem.test.tsx` → 0 报错。
- `npx tsc -p tsconfig.app.json --noEmit` 仅报 `src/components/ProjectWorkbench.tsx` 两个 TS6133（未使用的 `SkipToStageLink` / `WORKBENCH_PROJECTS_TARGET_ID`），来自并行槽位 R32-fable-arch 的进行中改动，与本槽位文件无关。
- 按约束未做任何 git commit / stash / checkout / push / 新分支。

## 验收方式

评审跑 `npx vitest run src/components/UniversityEmblem.test.tsx`（9 passed）；手动验收可在读屏（VoiceOver/NVDA）下滚动到未入视口的校徽，应朗读"<大学>校徽"而非跳过。
