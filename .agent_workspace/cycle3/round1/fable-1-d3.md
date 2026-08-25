# D3 · 导入失败常驻 role="alert"，成功保留 role="status"

MODEL: claude-fable-5-thinking-xhigh

## 改动内容

Cycle 3 审计项 D3：`DataWorkspace` 原本只有一个 `role="status"`（polite）live region 同时承载成功与失败消息。失败/阻断类消息（读屏用户最需要立即知道的）现在改走常驻 `role="alert"`（assertive）区域；成功/过程信息与替换摘要仍留在原 `role="status"` 区域。两个区域都常驻挂载——live region 必须先于内容变化存在，读屏才会播报。

### 文件（均在允许范围内）

| 文件 | 改动 |
|------|------|
| `src/lib/import-message.ts` | 新增纯函数 `isImportFailureMessage(text)`，按失败关键词（失败、没有、请先、不能为空、校验问题、无法）判定 |
| `src/lib/import-message.test.ts` | 新增：14 条失败文案 + 8 条成功/信息文案 + 空串共 23 个断言用例 |
| `src/components/DataWorkspace.tsx` | 单一 status 区域拆为两个常驻区域：status（polite，替换摘要 + 非失败消息）与 alert（assertive，失败消息）；消息仍是单一 `message` state，按 `isImportFailureMessage` 路由，成功消息到达时 alert 区域自动清空 |
| `src/components/DataWorkspace.test.tsx` | 新增 2 个用例（见下）；既有 3 个 live region 用例不改仍通过 |
| `src/styles.css` | 新增一行 `.data-message--alert`（红色系，取自 `.row-warning` 同款配色）；空态复用既有 `.data-message:empty` 规则（选择器按类名匹配两个区域，无需第二条 empty 规则） |

### 关键词覆盖核对

组件里全部 `setMessage` 失败路径逐条核对：`模板下载失败`/`智能识别失败`/`Excel 解析失败`（含 catch 的 `error.message`，如测试中的"读取失败"）、`没有从…识别到…`、`Excel 中没有工作表`、`请先粘贴名单`、`请先粘贴需要智能识别的名单`、`学生姓名、就读院校和城市不能为空`、`没有可导入的有效记录，N 条校验问题`、`识别结果无法转换为有效记录`，以及 `confirmImportCandidates` 透传的 `student-data.ts` 校验消息（`…不能为空`、`无法定位城市：…`）——全部命中六个关键词之一。成功路径（`已…` 开头、`从…识别到 N 条候选`、替换摘要）均不命中。

## 验证（failure → cause → fix → recheck）

本项无失败环节：新增用例与既有用例首轮即全绿，无需修复循环。证据如下。

1. **测试**（任务指定命令）：

   ```
   npx vitest run src/components/DataWorkspace.test.tsx src/lib/import-message.test.ts
   Test Files  2 passed (2)
   Tests  58 passed (58)
   ```

   - 新增 `routes failure messages to an always-mounted role=alert region`：初始 alert 存在且为空、`aria-live="assertive"`、失败消息进 alert 而 status 保持空、前后是同一 DOM 节点（未挂载/卸载）。
   - 新增 `empties the alert region when a later success message arrives`：失败后触发模板下载成功，status 收到 `已下载…`，alert 清空且节点复用。
   - 既有 3 个 live region 用例（status 常驻、替换摘要同区域、Excel 失败不写工程）未改动、继续通过——其中 Excel 失败用例的"读取失败"现落在 alert 区域，`container.textContent` 断言天然兼容。
2. **回归**：`npx vitest run server/styles.test.ts` → 12 passed（styles.css 加了一行规则，确认未影响 CSS 结构断言；该文件本身由本轮 CSS 任务的其他 agent 修改）。
3. **Lint**：`npx eslint` 四个改动 TS/TSX 文件 → exit 0，无告警。

## 交付与回滚

- 按任务要求未 commit/push；工作区中同时存在其他 agent 的 F3/A3/CSS 改动，本项改动严格限于上表 5 个文件（`src/styles.css` 的 diff 仅 1 行插入，即本项的 `--alert` 规则）。
- 无数据、导出格式、API 形状变更，纯前端可访问性改进；回滚 = 还原上述 5 个文件即可，无迁移。
- 验收建议：读屏（NVDA/VoiceOver）下触发一次失败（空名单点"一键识别并导入"）应立即播报；随后成功操作应以 polite 方式播报且失败提示消失。
