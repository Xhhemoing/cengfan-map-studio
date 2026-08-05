# 六阶段工作流重构进度记录（2026-08-05）

## 当前结论

六阶段公共工作流已完成主要实现与稳定化：

1. 选择模板
2. 上传数据
3. 地图样式
4. 展示框样式
5. 内容与排版
6. 最终导出

普通启动从“选择模板”开始；恢复的 `WorkspaceSession.stage` 会打开对应全屏工作区。旧三栏编辑器及 `WorkflowStepper`、`WorkflowGuide`、`GlobalDataScreen`、`GlobalSettingsScreen` 没有删除，继续作为内部兼容层保留，仅当浏览器存储 `cengfan-map-studio:legacy-editor` 的值严格等于 `"1"` 时启用。值缺失、`"0"` 或 `"true"` 都不会进入兼容模式。

`ProjectDocument` 仍是唯一业务状态，schema 与工程包版本保持 v2；活动阶段和当前选择通过独立的 `WorkspaceSession`/组件状态管理。地图算法、卡片布局核心算法和导出序列化核心没有因本阶段稳定化被重写。

## 本阶段完成内容

### 公共入口收敛

- 普通用户的六个阶段均通过全屏 workspace 渲染。
- `content` 阶段不再默认落入旧三栏编辑器。
- 新增并集中导出 `LEGACY_EDITOR_STORAGE_KEY`，避免 App 与测试使用分散字符串。
- 增加 public/legacy 测试入口和兼容旗标矩阵回归。
- 无效或不可用 localStorage 安全回退到模板工作区。

### 模板与最终导出响应式

- 模板工作区补齐桌面目录/预览布局、900px 单列布局和 760px 移动端操作区。
- 最终导出工作区补齐桌面双栏、900px 单列和 760px 单列导出按钮。
- 主要移动操作按钮最小高度为 44px。
- 预览区域限制内部滚动，保持 SVG 自身比例和导出尺寸逻辑。
- 模板与交付主要 surface/background/border 改用现有语义编辑器 token。
- `server/styles.test.ts` 使用 selector block 级合同检查，不再只依赖跨块宽正则。

### 交付定位修正

交付问题定位已集中到 `src/lib/delivery-target.ts`，并由 App 消费：

- `map`、`background`、`map-labels` → 地图阶段
- `province:<name>`、`map-label:<name>` → 地图阶段对应省份
- `display-frame:*` → 展示框阶段
- `cards:*` → 内容与排版的数据框
- `guests:title`、`guests:people`、`guest:<id>` → 内容与排版的嘉宾
- `text:*`、`asset:*` → 内容与排版对应对象
- 数据问题与排版健康问题继续使用现有独立分支

### 最终导出

- PNG、SVG、工程包继续调用既有导出 API。
- 最终导出工作区统一呈现 idle/exporting/success/error 状态。
- 失败后留在导出阶段，并保留当前倍率、透明背景和工程包资源配置。
- 支持按最后一次导出类型重试。
- 数据、排版、资源和字体检查在同一交付工作区呈现。

## 新鲜验证证据

执行时间：2026-08-05（当前工作区）

- `npm test -- --run`
  - 121 个测试文件通过
  - 785 项测试通过
  - 0 项失败
- `npx tsc -p tsconfig.app.json --noEmit`
  - 通过，0 个 TypeScript 错误
- `npm run lint`
  - 通过，0 个 ESLint 错误
- `npm run build`
  - Vite 生产构建通过
  - 主包约 1,539.27 kB，gzip 约 539.72 kB
  - 保留既有大于 500 kB chunk 警告
- `git diff --check`
  - 通过，无 whitespace error
  - 输出仅含工作区既有 LF/CRLF 转换警告

## 审查结果

最终代码质量审查结论为 **Ready with follow-ups**：

- 无 Critical 缺陷。
- 普通六阶段入口和 legacy gate 符合当前计划。
- 审查发现的 `map-labels`、`guests:*`、`display-frame:*` 定位缺口已补回归并修复。
- 全量验证已在审查修复后重新执行。

## 已知限制与后续优先级

1. **导出失败集成覆盖**：App 级回归现在覆盖 SVG 下载、PNG 转换和工程包下载失败；三者都会保留最终导出工作区、当前设置和重试入口。
2. **测试 helper 命名**：`src/App.test.tsx` 中大量历史测试仍通过兼容 helper 覆盖旧编辑器。后续应将所有旧调用显式改名为 `renderLegacyApp`，避免未来测试误以为覆盖了公共路径。
3. **CSS 测试工具**：`extractRule` 已改为 brace-depth 解析以正确覆盖嵌套规则；它仍不是完整 CSS parser，后续涉及注释、字符串或复杂 at-rule 的测试应改用 CSS parser。
4. **App 结构**：六个阶段的 topbar 仍有重复。可在独立任务中提取共享 workspace shell，但不应与业务行为改动同时进行。
5. **包体积**：生产构建仍有约 1.54 MB 主 chunk 警告。建议后续独立进行路由/工作区动态加载和 XLSX 分包，不在本轮稳定化中扩大范围。
6. **浏览器 E2E**：未安装 `@playwright/test`，因此没有声明 Playwright 覆盖；本次也未添加依赖。隔离 worktree 的 `npm install` 无法解析配置的 `mirrors.tencentyun.com`，网络恢复并获准安装依赖后，应增加真实浏览器的窄屏与导出冒烟测试。

## 工作区保护

- 未执行 reset、checkout 或 clean。
- 未覆盖或回退无关未提交修改。
- 未安装依赖、未修改 lockfile。
- 未创建 commit 或 PR。
