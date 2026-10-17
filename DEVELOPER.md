# 蹭饭图开发者指南

## 环境与启动

基线为 Node 22.13+（22.x）、npm 10+；`.nvmrc` 与 CI 保持同一主版本。使用锁文件安装，不要为运行项目重新解析全部依赖。

```bash
npm ci
npm run doctor
npm run dev
```

前端默认 `http://localhost:5173`，API 默认 `http://localhost:8787`。基础编辑不依赖模型密钥。生产配置见 [部署指南](DEPLOY-SERVER.md)。

## 模块地图

| 目录/文件 | 职责 |
| --- | --- |
| `src/main.tsx` / `src/components/StudioRoutes.tsx` | 稳定入口、工作台/编辑器路由、存储健康 |
| `src/App.tsx` / `src/components/` | 编辑器组合、画布、工作区、检查器 |
| `src/lib/` | 名单解析、工程文档、布局、导出、浏览器存储与客户端 |
| `src/data/` / `src/assets/` | 已检入的目录快照与地图数据 |
| `server/` | Node HTTP API、认证、协作、AI 与运行时持久化 |
| `scripts/` | 开发构建、串行任务保护、数据同步、回归与发布工具 |

技术栈为 React 19、Vite、TypeScript、MUI、d3-geo；测试使用仓库当前的 Vitest/jsdom 与测试辅助工具。不要为了过时文档中的建议额外引入测试框架。

## 常用命令

```bash
npm run doctor         # 无密钥环境诊断；-- --json 可供工具读取
npm run check:repository # 维护文档本地链接、元数据、工作流引用检查
npm run test:maintenance # Node 原生维护工具回归
npm run dev:web         # 仅 Vite
npm run dev:ai          # 仅 Node API
npx vitest run <file>   # 有针对性的回归
npm run test:release    # Node 原生发布工具测试，不依赖浏览器
npm run typecheck
npm run lint
npm test
npm run build
npm run check           # 维护、发布与应用质量检查串行执行
npm run security:report # 全量及生产依赖结构化联网审计
```

`npm run preview` 是 `npm run start` 的别名，会启动完整 API；静态构建预览请使用 `npx vite preview`。`scripts/run-heavy.mjs` 防止重型任务重叠；全量校验不要并行启动。

## 修改与验证

遵循 [AGENTS.md](AGENTS.md) 的模块归属、文件大小棘轮和验证纪律。纯算法放入 `src/lib` 并增加单元回归；界面改动保留现有状态与可访问性。涉及名单时阅读仓库对应导入约定，不修改事实来掩盖展示告警。

代码变化用相关回归覆盖；界面变化再做真实浏览器检查。顶栏回归脚本为 `scripts/check-topbar-browser.mjs`，对应 CI 单独安装固定版本的 Playwright 和 Chromium，不写入应用依赖。未运行的浏览器/平台不得写成已覆盖。

项目不在此承诺一个未实际测量的覆盖率百分比。CI 测试数量、跳过项和警告以对应 commit 的运行结果为准。

## 状态与隐私

项目默认保存在浏览器 IndexedDB。协作房间有运行态与文件快照恢复机制，依赖单实例持久目录、保存/关停行为及过期策略；不保证异常终止前所有事件都已持久化。工程包可能含完整源数据，分享前需审查。

## 贡献、计划与发布

[CONTRIBUTING](CONTRIBUTING.md) 说明 PR 流程；[ROADMAP](docs/ROADMAP.md) 管理未来任务；[PROJECT_STATUS](docs/PROJECT_STATUS.md) 区分已合并和未完成。

发布不再依赖手工推 tag 的隐含假设。必须准备 CHANGELOG 与 `docs/releases/vX.Y.Z.md`，审查主干 SHA，然后按 [RELEASING](docs/RELEASING.md) 执行验证、版本同步与发布。CI 通过、已合并和已发布是三个不同状态。

## 维护与贡献者自检

[项目治理](GOVERNANCE.md) · [架构导航](docs/ARCHITECTURE.md) · [维护手册](docs/MAINTAINERS.md)

仓库检查不代表独立安全认证，也不代替人工评审或分支保护设置。
