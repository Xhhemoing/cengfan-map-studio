# 蹭饭图开发者指南

> 目标：让开发者快速上手、贡献代码。

---

## 一、快速开始（5 分钟）

```bash
git clone https://github.com/Xhhemoing/cengfan-map-studio.git
cd cengfan-map-studio
npm install
npm run dev          # 前端 5173 + API 8787
```

打开 http://localhost:5173 即可开始体验。

---

## 二、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + Vite + TypeScript + MUI | 编辑器画布、组件库 |
| 地图 | d3-geo | 省/市边界投影 |
| 后端 | Node.js 内嵌 API | 认证、协作、AI 助手 |
| 存储 | IndexedDB（前端）+ 内存（后端） | 项目持久化、房间管理 |
| 测试 | Vitest + jsdom | 单元测试 + 组件测试 |
| 构建 | Vite + TypeScript | 生产构建 |

---

## 三、项目结构

```
src/
├── App.tsx                 # 应用入口（项目工作台 + 编辑器）
├── components/
│   ├── canvas/             # 地图画布、图层、数据层
│   ├── inspector/          # 右侧检查器面板
│   ├── workspaces/         # 工作区（卡片样式、布局等）
│   └── ...                 # 其他 UI 组件
├── lib/                    # 纯函数工具（场景文档、ID 生成、布局算法）
├── data/                   # 静态省/市数据
├── server/                 # Node API（认证、协作、AI）
└── styles.css              # 全局样式

scripts/                    # 构建、开发、数据同步脚本
docs/                       # 产品、设计、部署与示例
public/                     # 静态资源（Logo、校徽）
```

**开发规范**：详见 [AGENTS.md](AGENTS.md)

---

## 四、核心功能模块

### 1. 地图编辑器（src/App.tsx + components/canvas/）
- 点击省份选中 → 右侧面板编辑
- 拖拽卡片 + 智能避让
- 锚点连接线 + 交叉检测
- 缩放、平移、标尺

### 2. 项目工作台（src/components/ProjectWorkbench.tsx）
- 多项目 CRUD
- 导入/导出 .cengfan 项目包
- 本地 IndexedDB 存储

### 3. 素材库（src/components/AssetLibraryPanel.tsx）
- 字体、贴图、校徽上传
- 按省份绑定
- 实时预览

### 4. 协作（src/server/collaboration.ts）
- 创建房间 + 邀请码
- 实时同步（WebSocket）
- 权限控制（编辑/查看）

### 5. AI 助手（src/server/ai/）
- OpenAI 兼容接口
- 场景化指令白名单
- 流式响应

---

## 五、贡献流程

完整约定见仓库根目录 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 1. 认领 Issue
- 查看 [GitHub Issues](https://github.com/Xhhemoing/cengfan-map-studio/issues)
- 优先认领 `good first issue` 或 `help wanted`
- 在 Issue 下留言「我来做」

### 2. 开发规范
- 遵循 [AGENTS.md](AGENTS.md) 的验证纪律
- 新功能先写测试 → 最小实现 → 重跑测试
- 提交前运行相关测试与 `npm run lint`

### 3. 提交 PR
- Fork → 创建分支 → 开发 → 提交 PR
- PR 描述需包含：功能说明、如何验收、回滚方案
- 等待 Code Review 后合并

### 4. 贡献类型
- Bug 修复
- 新功能（需先开 Issue 讨论）
- 文档改进
- UI/UX 优化
- 测试覆盖

---

## 六、常见开发任务

### 添加新卡片模板
1. 在 `src/lib/card-templates.ts` 添加模板定义
2. 在 `src/components/workspaces/ReferenceCardStyleWorkspace.tsx` 注册
3. 写测试（参考 `src/lib/card-templates.test.ts`）

### 添加新省份数据
1. 运行 `npm run data:sync:china-locations`
2. 检查 `src/data/china-locations.ts` 是否正确更新
3. 写测试验证边界数据

### 扩展 AI 指令
1. 在 `src/server/ai/whitelist.ts` 添加白名单指令
2. 实现对应的 handler
3. 写集成测试

---

## 七、测试策略

```bash
npm test                    # 全量测试（串行）
npx vitest run <file>       # 单文件测试
npx vitest run -t "pattern" # 按名称过滤
```

**测试覆盖要求**：
- 新功能先补回归测试
- Bug 修复必须有回归测试
- UI 交互需用 `@testing-library/react`

---

## 八、社区与支持

- **GitHub Issues**：用模板选 Bug / 功能建议 / 使用意见
- **GitHub Discussions**：方向讨论（若已开启）

不要把真实学生名单、密钥或本机部署细节提交进仓库。

---

## 九、License

GNU AGPL v3 only — 详见 [LICENSE](LICENSE) 与 [docs/开源与收费边界.md](docs/开源与收费边界.md)
