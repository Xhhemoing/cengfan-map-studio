# 蹭饭地图工作室 (Cengfan Map Studio)

面向毕业班的去向地图(蹭饭图)编辑器:导入学生名单、编辑地图、管理字体/图片素材、智能布局、协作保存与高清导出。

## 技术栈

- 前端:React + Vite + TypeScript,`d3-geo` 地图投影,`pinyin-pro` 拼音排序,`xlsx` 表格导入导出
- 后端:`src/server` 内嵌 API(默认端口 `8787`,Vite 代理 `/api`),含 AI 助手(`server/ai`,LLM 客户端 + agent 循环)与协作模块
- 测试:Vitest(jsdom,覆盖 `src/**` 与 `server/**`)

## 快速开始

```bash
npm install
cp .env.example .env        # 配置 API/LLM 密钥等
npm run dev                 # 同时启动 Vite(5173)与 API(8787)
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发(web + API 并行) |
| `npm run dev:web` | 仅 Vite |
| `npm run dev:ai` | 仅 API 服务 |
| `npm test` | 全量 Vitest |
| `npm run test:watch` | 监听模式 |
| `npm run lint` | ESLint |
| `npm run build` / `npm run start` | 构建与生产启动 |

重操作(测试/lint/build)经 `scripts/run-heavy.mjs` 串行化,避免多任务并发争抢小内存 VM。

## 目录结构

- `src/` — React 前端(`App.tsx` 主画布,`Admin.tsx` 管理,`components/` 组件,`lib/` 工具与 AI 客户端,`data/` 静态数据)
- `src/server/` — Node API(认证、协作、AI agent 循环、导入导出)
- `scripts/` — dev/build/start 与重任务包装
- `docs/` — 设计规格与需求文档
- `.data/` — 运行时数据(不入库)

## 验证与提交

- 行为变更遵循 TDD:先写失败测试,再最小实现,重跑同一检查;完成报告记录 failure → cause → fix → recheck。
- 提交前运行 `npm run lint` 与 `npm test`;破坏性变更需说明回滚方案。
