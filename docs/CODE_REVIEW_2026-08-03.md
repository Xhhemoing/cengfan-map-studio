# Cengfan Map Studio 全量代码审查

审查日期：2026-08-03  
审查基线：9e691e2 (feat: add global data workbench and resizable editor UI)  
审查范围：src/、server/、构建/测试配置、现有单元测试与运行脚本。  
本次仅输出审查结果，未修改业务代码。

## 结论摘要

发现 10 项需要处理的问题：

| 等级 | 数量 | 主题 |
| --- | ---: | --- |
| P1 | 3 | 开发环境 API 不可达、持久化恢复失效、受限存储导致启动崩溃 |
| P2 | 6 | 去向编辑状态错误、空请求返回 500、OCR 未实现、大名单布局开销高、生产包过大、Windows 脚本不可用 |
| P3 | 1 | 统计 IP 可被伪造 |

最先处理 P1-1、P1-2 和 P1-3。它们分别影响开发环境的核心 API、数据恢复可靠性和部分浏览器的启动可用性。

## 发现

### P1-1 开发代理端口与 API 实际监听端口不一致

- 文件：vite.config.ts:11
- 对照：server/index.ts:20
- 现象：Vite 把 /api 代理到 127.0.0.1:8788，但 server/index.ts 固定监听 8787；package.json 的 dev/dev:ai 也没有覆盖这个端口。
- 影响：npm run dev 启动后，页面发出的 AI、协作和其他 /api 请求会被代理到错误端口，表现为连接失败或代理错误。服务端本身的测试使用内存端口并不能覆盖该开发联调问题。
- 建议：统一使用一个配置来源，例如让服务端读取 PORT 并把 Vite 代理改为同一端口；增加一个真正启动 Vite + API 的 smoke test。
- 置信度：高，静态配置直接矛盾。

### P1-2 IndexedDB 持久化写入了，但应用启动从未读取它

- 文件：src/App.tsx:235-236
- 对照：src/lib/browser-workspace-store.ts:136-143
- 现象：App 初始化只调用 loadBrowserWorkspaceMirror(browserStores.mirror)，只读取 localStorage 镜像；同一模块已经实现的 loadLatestBrowserWorkspace()（会比较 localStorage 与 IndexedDB 时间并选择最新副本）没有被 App 调用。
- 触发条件：localStorage 因配额、隐私模式或浏览器策略写入失败，但 IndexedDB 写入成功；保存函数会返回 durable=saved、mirror=failed，然而下次启动仍不会读取 durable 副本。
- 影响：用户看到“持久化保存成功”，刷新或重新打开后却无法恢复刚保存的完整工程，资源、字体和模板尤其容易丢失。
- 建议：启动时增加异步 hydration 状态，调用 loadLatestBrowserWorkspace() 后再决定初始工程；或先渲染最小默认状态，恢复完成后原子替换整个 workspace，并处理恢复期间用户编辑的竞态。
- 现有覆盖：browser-workspace-store.test.ts 已验证 helper 能从 durable store 恢复，但没有验证 App 的启动集成。
- 置信度：高。

### P1-3 localStorage 访问未统一兜底，存储受限时可能直接阻止编辑器启动

- 文件：src/App.tsx:209、253、257、260
- 现象：loadInitialProject() 直接调用 window.localStorage.getItem()；没有完整 workspace 时，初始化状态又直接调用 loadCustomTemplates()、loadUserFonts() 和 loadUserAssets()，这些默认存储参数也会直接读取 localStorage。
- 触发条件：浏览器禁用站点存储、隐私模式拒绝访问、StorageAccess 被拒绝或读取抛出 SecurityError。
- 影响：初始化函数抛错，React 根组件可能无法挂载；而主题、面板布局等模块已经采用 try/catch，说明这里的异常处理策略不一致。
- 建议：提供统一的安全 storage adapter，所有启动读取都返回空/默认值并记录非阻塞状态；不要让本地存储能力决定编辑器是否能打开。
- 置信度：高，异常路径未被调用方捕获。

### P2-1 将已有学生从“海外”切回“中国”不会清除 locationScope

- 文件：src/components/DataWorkspace.tsx:162-170
- 对照：src/App.tsx:1161-1167
- 现象：编辑保存时只有选择 international 才把 locationScope 写入 patch；选择 china 时省略该字段。父组件使用对象合并，因此已有的 locationScope=international 会被保留。
- 复现：打开海外学生 -> 编辑 -> 选择“中国” -> 保存；列表仍显示“海外”，地图/省份统计也继续把它排除在中国数据之外。
- 影响：用户无法通过现有编辑控件纠正去向类型，数据健康统计和最终海报都可能持续错误。
- 建议：切换到中国时显式发送 locationScope=undefined，并在父层用“字段是否存在”区分“清除”与“未修改”；补充该回归测试。
- 现有覆盖：已有新增海外学生测试，但没有覆盖海外 -> 中国编辑路径。
- 置信度：高。

### P2-2 合法 JSON 的 null/数组请求会返回 500，而不是 4xx 校验错误

- 文件：server/index.ts:447、483、593
- 现象：readJson() 返回 unknown，这些路由直接把结果断言为对象并读取 body.clientId、body.txId 或 body.message。发送 JSON null 时会抛出 TypeError，被最外层 catch 转成 500；数组/字符串也绕过了清晰的对象校验。
- 影响：客户端收到错误的服务器内部错误语义；监控会把客户端输入错误计为服务端故障，也会增加不必要的错误日志/重试。
- 建议：增加 isRecord/schema 校验，所有请求体在字段访问前先确认是非数组对象；为 null、数组、缺字段分别补充 400 测试。
- 置信度：高。

### P2-3 图片 OCR 入口仍是占位实现，上传图片不会产生 OCR 结果

- 文件：src/components/DataWorkspace.tsx:233-243、422
- 现象：图片上传处理函数名为 handleImageOcrStub，只在文本框已有内容时解析文本；没有文本时仅显示“请把 OCR 识别文本粘贴到文本框”，没有读取图片、调用 OCR 服务或返回候选数据。
- 影响：界面提供了“选择名单图片”和“PNG / JPG”入口，但核心 OCR 功能未实现，用户会误以为图片已经被识别。
- 建议：接入明确的 OCR adapter，并显示处理中、失败、置信度和人工确认状态；在未配置 OCR 时应隐藏/禁用该入口或明确标注“仅支持粘贴 OCR 文本”。
- 置信度：高，代码已有明确 Stub 标识。

### P2-4 大名单布局的候选评估包含高阶计算，可能阻塞主线程

- 文件：src/lib/card-layout.ts:931-963、1023-1086
- 现象：每个布局候选都要与已放置卡片两两检查连接线交叉和穿透；每个候选顺序还会重复执行，最终 scoreLayout() 再次执行放置结果的两两比较。PosterCanvas 在每次相关工程状态变化时重新调用 solveCardLayout()。
- 影响：当按院校/城市分组形成几十到几百张卡片时，拖拽、改字体或改数据可能造成明显主线程卡顿；没有性能预算、worker 或增量缓存来隔离布局计算。
- 建议：先用空间索引/包围盒粗筛连接线，再做精确几何检测；缓存不变的地图障碍物和卡片测量；对大于阈值的名单采用分批/worker 或可解释的降级布局，并增加 100/500/1000 卡片基准测试。
- 置信度：中高，复杂度由源码结构直接可见，实际卡顿程度取决于数据规模。

### P2-5 生产包体积过大，首屏加载包含重型编辑器代码

- 文件：package.json:17-24、src/components/DataWorkspace.tsx:207
- 验证：直接执行 vite build 成功，但输出 dist/assets/index-DspReX3T.js 压缩后约 1,476.95 kB（gzip 约 524.86 kB），xlsx chunk 约 424.08 kB；Vite 明确给出 Some chunks are larger than 500 kB 警告。
- 影响：首次打开编辑器的下载、解析和执行成本偏高，低端设备或移动网络上更明显；Excel 导入依赖虽已动态 import，但主编辑器仍然很大。
- 建议：按全局数据、资源/字体、工作流或管理页拆分路由/动态组件；审查 xlsx 依赖是否可替换为按需解析器；为首屏 JavaScript 建立 gzip/parse budget，构建中把超预算变成可见告警。
- 置信度：高，构建输出已实测。

### P2-6 Windows 下声明的 test/build/lint/start 脚本不可用

- 文件：package.json:10-14、scripts/run-heavy.sh:1
- 验证：在当前 PowerShell 中运行 npm test、npm run build、npm run lint 均在进入测试/编译/ESLint 前失败：'bash' is not recognized as an internal or external command。start 还使用 STATIC_DIR=dist 的 POSIX 环境变量语法。
- 影响：Windows 开发者无法使用项目声明的标准验证和启动命令；CI/本机实际校验路径分裂，容易出现“直接二进制通过但 npm 脚本不可交付”的情况。
- 建议：把重型任务锁和降优先级逻辑迁移到 Node/跨平台脚本，或明确要求 Git Bash/WSL 并提供 Windows 等价脚本；用 cross-env 或 Node 启动器设置 STATIC_DIR。
- 置信度：高，命令失败已复现。

### P3-1 未配置可信反向代理时，访问统计 IP 可被请求头伪造

- 文件：server/index.ts:45-49
- 现象：clientIp() 无条件优先信任任意请求携带的 x-forwarded-for，服务本身没有可信代理配置或来源判断。
- 影响：公网客户端可伪造 IP，导致 uniqueIps、访问来源和管理页统计失真；若后续按 IP 做限流/审计，会进一步产生错误判断。
- 建议：仅在明确配置的可信反向代理后读取 forwarded headers，否则使用 socket 地址；可同时保留原始 forwarded 值供审计，并增加伪造头测试。
- 置信度：高。

## 验证记录

### 已通过

- node_modules/.bin/tsc.cmd -b：通过。
- node_modules/.bin/vite.cmd build：通过，但有上述大包警告。
- node_modules/.bin/eslint.cmd .：通过。
- 关键测试：DataWorkspace.test.tsx + browser-workspace-store.test.ts，2 个文件、19 个测试通过。
- 服务端集成测试：server/index.test.ts，1 个文件、19 个测试通过。
- 核心数据/持久化测试：6 个文件、44 个测试通过。

### 未完成或不应据此下结论

- npm test、npm run build、npm run lint：均未进入实际任务，原因是 npm 脚本依赖当前 PowerShell 不可用的 bash。
- 完整 vitest run：本次执行被中断，不能宣称全量测试通过或失败。
- Graphify 图谱：已有输出基于旧提交 a89931a，仅用于架构导航；本报告的发现均回到当前源码和当前命令证据核对。

## 建议修复顺序

1. 统一 API 端口并补一条 npm run dev 的端到端 smoke test。
2. 修复启动时完整 workspace hydration，覆盖 IndexedDB-only 场景和存储受限场景。
3. 修复 locationScope 清除语义，并补充海外/中国来回切换测试。
4. 统一服务端请求 schema，先验证对象再访问字段。
5. 决定 OCR 的产品边界：接入真实 adapter，或在 UI 上明确关闭未实现入口。
6. 对卡片布局做基准测试后再引入空间索引、缓存和大名单降级策略；同时拆分首屏 bundle。
7. 将验证脚本改为跨平台实现，确保声明的 npm 命令在 Windows 可执行。
