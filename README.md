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

打开 `http://localhost:5173/` 先进入**项目工作台**(项目列表),点「新建项目」或项目卡片进入编辑器;支持多项目新建/复制/重命名/删除/导出/导入,编辑内容自动保存到浏览器本地。

AI agent 使用 OpenAI 兼容接口。旧变量 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 继续可用；生产环境建议使用 `AI_PRIMARY_API_KEY`、`AI_PRIMARY_BASE_URL`、`AI_PRIMARY_MODEL` 和可选的 `AI_FALLBACK_*`。未配置主模型时 agent 使用本地确定性规则。生产部署、状态文件、启动门禁、`/api/live`、`/api/ready` 与回滚流程见 [AI 生产部署手册](docs/deployment/ai-production.md)。运行中的配置状态、路由与任务限制可通过 `GET /api/health` 查看，健康响应不会暴露密钥。

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

## 行政区划数据(省/市)

浏览器使用的省/市目录是**检入仓库的静态数据** `src/data/china-locations.ts`:构建与运行时直接读取该文件,**不会发起任何运行时位置数据请求**。目录仅包含省级与地级市(州/盟)数据,**不含区县/乡镇**(省/自治区直辖县级行政区划等占位行也会被排除)。

仅在需要维护/升级目录时,才运行同步脚本(此时才会从 npm 下载 `province-city-china` 包):

```bash
npm run data:sync:china-locations                # 同步到 latest 版本
npm run data:sync:china-locations -- --version 8.5.8   # 固定版本,结果可复现
```

脚本只读取包内 `province.json` 与 `city.json`(从不触碰 district/town 数据),并在内存中校验通过后才覆盖静态文件;直辖市/港澳/台湾等兼容条目与历史别名由脚本在生成时合成。

## 目录结构

- `src/` — React 前端(`App.tsx` 编辑器画布,`components/ProjectWorkbench.tsx` 项目工作台,`components/` 组件,`lib/` 工具与 AI 客户端(含 IndexedDB 项目存储),`data/` 静态数据)
- `server/` — Node API(认证、协作、AI agent 循环、导入导出)
- `scripts/` — dev/build/start 与重任务包装
- `docs/` — 设计规格与需求文档
- `.data/` — 运行时数据(不入库)

## 共享协作

共享房间保存在 API 进程内，空闲一段时间后会过期。创建者可以生成“可编辑”或“仅查看”的单次邀请凭证；该凭证与房间访问 token 都是访问权限，应通过私密渠道发送。成员 token 仅保存在当前浏览器的本地存储中，离开房间、令牌失效或房间过期都不会删除本机工程草稿。当前实现不提供账户身份审计、永久历史、跨实例持久化或端到端加密。

## 验证与提交

- 行为变更遵循 TDD:先写失败测试,再最小实现,重跑同一检查;完成报告记录 failure → cause → fix → recheck。
- 提交前运行 `npm run lint` 与 `npm test`;破坏性变更需说明回滚方案。
