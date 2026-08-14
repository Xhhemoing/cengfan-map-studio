# 蹭饭地图工作室 (Cengfan Map Studio)

面向毕业班的去向地图(蹭饭图)编辑器:导入学生名单、编辑地图、管理字体/图片素材、智能布局、协作保存与高清导出。

## 快速上手 (5 分钟)

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（可选）

```bash
cp .env.example .env
```

- 如需使用 AI 助手功能，需在 `.env` 中配置 OpenAI 兼容接口的 API Key
- 仅本地编辑功能可跳过此步

### 3. 启动开发服务器

```bash
npm run dev
```

- 前端: http://localhost:5173
- API: http://localhost:8787

### 4. 创建你的第一个项目

1. 打开浏览器访问 http://localhost:5173
2. 点击「新建项目」，输入班级名称
3. 进入编辑器后：
   - 左侧可切换「项目工作台」或「编辑画布」
   - 点击地图省份即可选中并编辑卡片
   - 右侧面板可调整卡片样式、布局、字体
   - 支持导入 Excel/CSV 学生名单

### 5. 导出与分享

- 点击右上角「导出」按钮可生成高清 PNG/PDF
- 支持导出项目为 `.cengfan` 文件（可导入到其他设备）

## 功能概览

| 功能 | 说明 |
|------|------|
| 地图编辑 | 点击省份选中，拖拽卡片，智能避让布局 |
| 素材库 | 上传字体、贴图、校徽，支持按省份绑定 |
| 学生名单 | Excel/CSV 导入，自动匹配姓名与去向 |
| 智能布局 | 自动/手动混合布局，卡片不重叠 |
| 协作 | 创建房间邀请他人实时编辑 |
| 导出 | 高清 PNG / PDF / 项目包 |

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（web + API） |
| `npm run dev:web` | 仅启动 Vite 前端 |
| `npm run dev:ai` | 仅启动 API 服务 |
| `npm run build` | 生产构建 |
| `npm run start` | 生产启动 |
| `npm test` | 运行测试 |
| `npm run lint` | 代码检查 |

## 技术栈

- **前端**: React 19 + Vite + TypeScript + MUI + d3-geo
- **后端**: Node.js 内嵌 API（认证、协作、AI）
- **测试**: Vitest + jsdom
- **数据**: 静态省/市数据（`src/data/china-locations.ts`）

## 目录结构

```
src/
├── components/     # UI 组件（画布、面板、检查器）
├── lib/            # 工具函数、场景文档、ID 生成
├── data/           # 静态地图数据
├── server/         # Node API（认证、协作、AI）
└── App.tsx         # 应用入口

scripts/            # 构建、开发、数据同步脚本
docs/               # 设计文档与使用手册
```

## 常见问题

**Q: 端口 8787 被占用怎么办？**
A: 修改 `.env` 中的 `PORT` 或使用 `PORT=9000 npm run dev`

**Q: 构建失败？**
A: 先运行 `npm run lint`，确保无语法错误；必要时删除 `node_modules` 重新安装

**Q: 如何贡献代码？**
A: 参考 `AGENTS.md` 中的开发规范，提交前请运行 `npm run lint && npm test`

## 许可证

MIT License — 详见 [LICENSE](LICENSE) 文件

---

> **提示**: 本项目聚焦「毕业班去向地图」场景，欢迎提交 Issue 和 PR 共同完善！