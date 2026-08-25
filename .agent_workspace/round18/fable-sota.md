MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 18 — 全局设置页 skip link

## 结论

全局设置页现在有了与工作室壳同款的键盘跳转链接：`.skip-link` 视觉隐藏、聚焦浮出，
回车把焦点移到包住设置主内容（分区 tablist + 表单 tabpanel）的 `#global-settings-main`
（tabindex=-1）容器，不改写 `window.location.hash`，也不占用工作室的 `#studio-stage` id。

## 改动

| 文件 | 内容 |
| --- | --- |
| `src/components/studio-editor/SkipToStageLink.tsx` | 泛化：新增可选 `targetId` / `label` props，默认值仍为 `STUDIO_STAGE_TARGET_ID` + 「跳到主要内容」，工作室两处调用（`StudioStageScreen`、`LegacyEditorChrome`）零改动、行为不变。 |
| `src/components/GlobalSettingsScreen.tsx` | 模块私有常量 `SETTINGS_MAIN_TARGET_ID = "global-settings-main"`（不导出，满足 react-refresh only-export-components）；`<main>` 首子元素渲染 `<SkipToStageLink targetId=… label="跳到设置内容" />`，先于页头历史操作进入 Tab 序；既有 `.global-settings-layout` div 加 `id` + `tabIndex={-1}` 作为落点，复用现有元素、不新增包裹层（`.skip-link` 为 `position:fixed`，不占 `.global-settings-screen` 的网格轨道，布局不受影响）。 |
| `src/components/GlobalSettingsScreen.test.tsx` | 新 describe「skip link」两条：① href 为 `#global-settings-main`、落点 tabindex=-1 且包含 tablist+tabpanel、容器内无 `#studio-stage`、点击后 `document.activeElement` 为落点且 hash 不变；② skip link 在 DOM/Tab 序上先于 `.global-settings-header`。 |
| `USER_GUIDE.md` | 键盘无障碍条目追加 1 句：全局设置页的「跳到设置内容」链接可越过页头撤销/重做直达设置分区。 |

## 设计要点

- 设置整页由 `GlobalSettingsRoute` 挂载，会整体替换工作室壳（`App.tsx` 提前 return），
  所以两套 skip link / 落点 id 永不同屏；即便如此仍各持有独立 id，互不冲突。
- `GlobalSettingsRoute.tsx` 不在本轮允许清单内，skip link 因此放在 `GlobalSettingsScreen`
  自己的 `<main>` 内——恰好解决题面问题（其页头撤销/重做/完成先吃 Tab）。
- 泛化组件沿用「拦截默认片段跳转 + programmatic focus」模式，hash 路由
  （`#/project/<id>`）不被改写。

## 验证（failure → cause → fix → recheck）

- 唯一一次失败：首次编辑 `GlobalSettingsScreen.tsx` 时 StrReplace 未命中——并行进程
  已把 `useHistoryAnnouncement` 的 import 迁到 `./use-history-announcement`。重读文件
  确认 JSX 区域未变后，基于当前状态重新套用编辑，成功。
- `npx vitest run src/components/GlobalSettingsScreen.test.tsx src/App.shell.test.tsx`
  → 2 files, **21 passed**（含新 2 条；App.shell 的 studio skip-link 两条契约测试保持通过，
  证明泛化未破坏工作室行为）。
- `npx eslint`（3 个触碰的 ts/tsx 文件，`--max-warnings=0`）→ 通过。

## 交付与回滚

- 按指令未 commit；改动全部在工作区。验收方式：跑上述两个 vitest 套件 +
  手动在全局设置页按 Tab（第一个设置区焦点应为「跳到设置内容」）。
- 回滚：还原上表 4 个文件即可，无数据/导出格式/API 形状变更。
