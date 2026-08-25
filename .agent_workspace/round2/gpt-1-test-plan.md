MODEL: gpt-5.6-sol-xhigh-fast
# Round 2：Round 3 A–H 失败测试与命令计划（R2-G1）

日期：2026-08-24（UTC）  
范围：只写测试计划和隔离探针；未修改 `src/`、`server/`，未安装依赖，未提交、未推送。

## 1. 依赖与基线证据

### 实际命令

```bash
test -d node_modules
test -x node_modules/.bin/vitest
npx --no-install vitest --version
```

结果：

- `node_modules=missing`，`node_modules/.bin/vitest` 不存在。
- `/tmp/cursor/async-install/install-user.status` 为 `0`，只说明环境安装脚本已结束；不能据此声称项目依赖已安装。
- `npx --no-install vitest --version` 退出码为 **1**，输出：

```text
npm error npx canceled due to missing packages and no YES option: ["vitest@4.1.11"]
```

因此 Vitest 当前不能运行。本轮没有让 `npx` 下载包，也没有伪造任何测试通过结果。原计划的小基线是：

```bash
npx vitest run src/lib/stage-overview.test.ts
```

但因上述依赖缺失，**未执行**。证据链为：命令失败（exit 1）→ 本地依赖目录和 Vitest 可执行文件均缺失 → 本轮按约束不安装 → Round 3 先执行项目既定安装步骤，再重跑同一 `--no-install` 探针和该单文件基线。

## 2. 已有测试落点

| 领域 | 已有测试 | 结论 |
|---|---|---|
| 数据工作台 | `src/components/DataWorkspace.test.tsx` | 已测独立组件的 XLSX 模板按钮，但没有 `aria-live` 断言 |
| 正式数据阶段 | `src/components/workspaces/DataUploadWorkspace.test.tsx` | 第 96 行当前反而断言 XLSX 模板按钮不存在，是 D 的现成 RED 改写点 |
| 模板选择器 | 无 `TemplatePicker.test.*`；源码为 `src/components/TemplatePicker.tsx` | B 需新建 UI 测试 |
| 项目工作台 | `src/components/ProjectWorkbench.test.tsx` | 已测首次自动播种和播种失败重试；未测主动重载示例 |
| 模板存储 | `src/lib/template-store.test.ts` | 已测本地模板清除学生数据；未定义独立交换格式 |
| 交付工作台 | `src/components/workspaces/DeliveryWorkspace.test.tsx` | 已测错误条、倍率和按钮；未测成功结果条 |
| 阶段总览 | `src/lib/stage-overview.test.ts` | 当前只测 10 人健康名单；0 人会被错误派生为 `data-clean` |
| 协作 UI | `src/App.test.tsx` | 已测 owner/editor/viewer、成员和只读；当前成员显示仍退化为 clientId |
| 协作客户端 | `src/lib/collaboration-client.test.ts`、`src/lib/collaboration-operations.test.ts` | 协议与增量操作已有覆盖 |
| 协作服务端 | `server/collaboration.test.ts`、`server/index.test.ts` | 已有 `displayName` 和角色协议覆盖；E 不应改 API |
| 宣发脚本 | 无测试 | C 和退出码测试均需新建 |
| Changelog | 无 `CHANGELOG.md`，也无治理测试 | G 需新建文档契约测试 |

## 3. A–H：先写失败测试

### A. 应用内“提意见 / 帮助”入口

拟新增：

- 主测试：`src/components/FeedbackHelpMenu.test.tsx`
- 壳层接线：在 `src/App.test.tsx` 加一条轻量集成测试

示例断言（当前因组件/入口不存在而 RED）：

1. 编辑器顶栏恰有一个 `aria-label="帮助与反馈"` 入口，菜单内同时有“提意见”和“帮助”链接。
2. 反馈链接指向 `https://github.com/Xhhemoing/cengfan-map-studio/issues/new`，并带 `template=feedback.yml`。
3. 预填正文只含白名单元数据：应用版本、构建提交、当前制作阶段、浏览器类别和视口；不得含 `projectId`、项目名、房间号/token、localStorage 内容或学生字段。
4. 在页面放入哨兵文本“林舟 / 北京大学 / 高三3班”后，解码后的 URL 仍不包含这些文本；外链带 `target="_blank"` 与 `rel="noopener noreferrer"`。

命令：

```bash
npx vitest run src/components/FeedbackHelpMenu.test.tsx
npx vitest run src/App.test.tsx
```

实现锚点：新组件挂到 `StudioTopbar` 的 actions 区，不改六阶段导航；URL 生成器只接收白名单环境对象，禁止接收 `ProjectDocument`。这样“零 PII”由类型边界和负断言共同保证。

### B. 社区模板独立格式、导入/导出、拒收 `students`

拟新增：

- `src/lib/community-template-package.test.ts`
- `src/components/TemplatePicker.test.tsx`（该组件目前没有测试）

先锁定格式：扩展名 `.cengfan-template`，根结构为
`{ kind: "cengfan-community-template", version: 1, template: ... }`；它与 `.cengfan` 工程包分开。

示例断言：

1. `serializeCommunityTemplate` 再 `parseCommunityTemplate` 可往返保留模板名、scope、document/scene，根 `kind/version` 精确匹配。
2. 输入根级或任意嵌套级 `students` 时解析必须抛出“社区模板不得包含学生名单”，不能静默剥离后接受。
3. 工程包 `kind`、未知版本、缺失模板字段均被拒绝，且失败导入不会写入 localStorage。
4. `TemplatePicker` 显示“导入社区模板/导出社区模板”；文件输入 `accept` 包含 `.cengfan-template`，选中文件只调用一次导入回调。

命令：

```bash
npx vitest run src/lib/community-template-package.test.ts
npx vitest run src/components/TemplatePicker.test.tsx
```

实现锚点：解析/序列化放新纯函数模块；`template-store.ts` 继续负责 localStorage，不改变既有记录形状。回滚时可删除新格式模块与两个 UI 控件，旧本地模板不受影响。

### C. `promo:lint`：禁用词、能力漂移与 CLI 退出码

拟新增：

- `scripts/promo-lint.test.ts`
- `scripts/promo-cli-exit.test.ts`

示例断言：

1. 发布文案里的“本科率：85%”“录取率 90%”以及 hashtag `#985` 被报为合规违规。
2. “导出 PDF / 导出 Word / 世界地图”被报为产品能力漂移；“PNG/SVG”通过。
3. “禁止写升学率”“不要承诺世界地图”等否定/政策上下文不报错，避免扫描规范文档时误伤。
4. `promo:lint` 对有违规 fixture 退出 1、干净 fixture 退出 0，并输出文件、行号、规则 ID。

命令：

```bash
npx vitest run scripts/promo-lint.test.ts
npx vitest run scripts/promo-cli-exit.test.ts
```

当前应修复的正向违规清单：

- `docs/案例模板/普通高中-68人.md:10`：`本科率：85%`
- `docs/案例模板/国际部-12人.md`：多处“世界地图”
- `docs/脚本库/成果-3版.md:25,65`：`#985`、世界地图
- `scripts/宣发流程-内容生成.mjs:113`：`#985`
- `docs/私域/用户群运营手册.md:42`：世界地图、导出 Word
- `docs/私域/毕业季-checklist.md:13`：导出 PDF

`docs/KOL/合作话术.md` 当前是“删除 +200–500 Star 类许诺”的否定说明，不应被列为待修文案；这也是上下文豁免测试必须存在的原因。

### D. 恢复 XLSX 模板下载；导入结果可被读屏宣布

拟扩展：

- `src/components/workspaces/DataUploadWorkspace.test.tsx`
- `src/components/DataWorkspace.test.tsx`
- `src/App.test.tsx` 增加正式阶段接线断言

示例断言：

1. 把 `DataUploadWorkspace.test.tsx` 现有“按钮为 null”改为“展开导入后按钮存在”；该断言现在会立即 RED。
2. 正式 App 的数据阶段展开导入区后，也能找到 `button[aria-label="下载学生数据 XLSX 模板"]`，防止 App 仍传 `hideTemplateDownload: true`。
3. XLSX 下载、文本识别成功、失败消息均位于唯一的 `[role="status"][aria-live="polite"]` 容器。
4. 导入失败时 `onAppendStudents/onReplaceStudents` 仍不调用，保留现有事务安全断言。

命令：

```bash
npx vitest run src/components/workspaces/DataUploadWorkspace.test.tsx
npx vitest run src/components/DataWorkspace.test.tsx
npx vitest run src/App.test.tsx
```

实现锚点：移除 `DataUploadWorkspace.tsx:128` 的强制隐藏和 `App.tsx:1668` 的隐藏 prop；把现有 `.data-message` 改为稳定 live region，不重复渲染多个播报节点。

### E. 协作本地昵称与完整角色文字标签（API 零改动）

拟新增/扩展：

- 新建 `src/components/ProjectMenu.test.tsx`
- 扩展 `src/App.test.tsx` 的现有协作组

示例断言：

1. 本地昵称输入会 trim 后写入独立 localStorage key；重新挂载恢复该值，空值回退为不重复的 `协作者-<clientId短码>`。
2. 创建和加入房间请求体的 `displayName` 使用本地昵称，不再固定发送“本机协作者”。
3. 用现有 `participants[].id/displayName` 与 `members[].clientId` 配对后，列表显示“小林”“小周”，有昵称时不显示 `成员 c-edit`。
4. 三种成员项分别出现明确文字“创建者 / 编辑者 / 查看者”，不能靠皇冠 emoji 或缺省文字表达 editor。

命令：

```bash
npx vitest run src/components/ProjectMenu.test.tsx
npx vitest run src/App.test.tsx
```

实现锚点：复用现有 create/join 的 `displayName` 字段和 GET room 已返回的 `participants`；只改前端状态、localStorage 和展示，不改 `server/`、房间协议或权限判断。

### F. 导出文件名含项目名/倍率；成功结果条

拟新增/扩展：

- 新建 `src/lib/usePosterExport.test.tsx`
- 扩展 `src/components/workspaces/DeliveryWorkspace.test.tsx`

示例断言：

1. 项目名“高三3班”、倍率 2 的 PNG 调用下载器时文件名为 `高三3班-2x.png`。
2. 文件名生成器会替换 `/\:*?"<>|`、控制字符和尾随点；空名回退“我的毕业去向图”，不得生成路径。
3. SVG 使用清洗后的项目名和 `.svg`；PNG 倍率只出现一次，不产生 `2x-2x`。
4. `exportState="success"` 时交付侧出现 `[role="status"][aria-live="polite"]`，文本包含实际文件名；idle 不显示，error 仍使用既有 `role="alert"`。

命令：

```bash
npx vitest run src/lib/usePosterExport.test.tsx
npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx
```

实现锚点：给 `usePosterExport` 传只读 `projectName`，返回最近一次成功结果 `{ format, filename }`；`DeliveryRail` 只渲染结果，不自行重算文件名。

### G. `CHANGELOG.md` 与贡献者致谢规则

拟新增：`scripts/repository-governance.test.ts`（Node 环境，读取仓库文档）。

示例断言：

1. 根目录 `CHANGELOG.md` 存在，含 `# Changelog` 和 `## [Unreleased]`。
2. Unreleased 至少预留“新增 / 变更 / 修复”分类，条目可链接 Issue/PR。
3. `CONTRIBUTING.md` 含“贡献者致谢”规则：只使用贡献者主动提供的公开昵称、附 Issue/PR、不得写学生姓名和学校。
4. 规则明确致谢不是付费会员、套餐权益或优先级购买，不引入支付字段或产品开关。

命令：

```bash
npx vitest run scripts/repository-governance.test.ts
```

实现锚点：只改根文档；不建立账号、会员或支付实现。文档测试用于防止后续把“致谢”重新写成收费权益。

### H. 工作台“重新载入示例”；空名单不再判健康

拟扩展：

- `src/components/ProjectWorkbench.test.tsx`
- `src/lib/stage-overview.test.ts`

示例断言：

1. store 已有一个空项目时，点击“重新载入示例”后新增一个含 `sampleStudents` 的示例项目，原项目仍存在。
2. 重载失败时显示 `role="alert"` 和“重新载入示例失败”，不得删除或覆盖已有项目。
3. `dataHealth.total=visible=0` 时派生 `data-empty` warning/info 卡，状态提示“尚未导入名单”，并提供前往数据阶段的动作。
4. 同一空名单结果不得包含 `data-clean`；原有 10 人健康名单仍保持 `data-clean/ok`。

命令：

```bash
npx vitest run src/components/ProjectWorkbench.test.tsx
npx vitest run src/lib/stage-overview.test.ts
```

实现锚点：重载是显式新增示例，不复用只执行一次的自动播种 ref，也不覆盖用户项目；空名单判断优先于“没有 issue”判断。

## 4. Promo 退出码探针与 Round 3 测法

本轮在隔离临时 cwd 执行脚本，未读取仓库真实数据目录：

```bash
node /workspace/scripts/宣发流程-数据收集.mjs --report
node /workspace/scripts/宣发流程-素材检查.mjs
```

证据日志：

- `.agent_workspace/round2/probes/promo-report-missing.log`：明确打印“未找到当前数据文件”，但 `EXIT_CODE=0`。
- `.agent_workspace/round2/probes/promo-check-empty.log`：必需素材 **25/25 全缺失**，但 `EXIT_CODE=0`。

Round 3 的 `scripts/promo-cli-exit.test.ts` 应使用 `spawnSync(process.execPath, [script, ...args], { cwd: fixture })`，不要在测试进程内 import 会立即执行的 CLI：

1. 空 fixture 运行素材检查：`status === 1`，stderr/stdout 含“缺失 25 项”。
2. 只缺可选素材、所有 required 均存在：`status === 0`。
3. 无 `docs/宣发数据/current.json` 运行 `--report`：`status === 1`，且不生成报告文件。
4. 写入最小合法 `current.json` 后运行 `--report`：`status === 0`，报告文件存在；未知 mode 建议固定为退出 2。

脚本修复方式应显式设置 `process.exitCode`，不要在深层函数直接 `process.exit()`，以便 finally/输出完成。修复后先重跑：

```bash
npx vitest run scripts/promo-cli-exit.test.ts
```

再做两个同形 shell 探针，确认日志从 `EXIT_CODE=0` 变为预期的 1。

## 5. Round 3 建议执行顺序

按“最小纯函数 → 组件 → 集成/文档”推进，且每项先 RED、实现后重跑同一命令：

1. H 的 `stage-overview` 空名单，再做工作台重载。
2. D 的模板按钮与 live region。
3. F 的文件名纯逻辑与成功结果条。
4. B 的社区模板 parser/serializer，再接 TemplatePicker。
5. E 的本地身份和 ProjectMenu，再跑 App 协作集成；不跑服务端改动。
6. A 的反馈 URL 白名单与顶栏入口。
7. C 的 lint 规则、修文案和 CLI 退出码。
8. G 的 Changelog/致谢文档契约。

不要并行跑全套检查。每个目标文件通过后再按仓库纪律串行执行相关更大检查；任何失败都记录 failure → cause → fix → recheck，不能仅重试。
