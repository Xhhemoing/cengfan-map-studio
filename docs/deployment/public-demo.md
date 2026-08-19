# 公开演示站：Cloudflare Pages / GitHub Pages / 可选容器

> 一句话：**给大家参观，优先用静态站（Cloudflare Pages 或 GitHub Pages）。** 不要把现有 Node API 原样丢进 Cloudflare Workers。名单默认在浏览器 IndexedDB，静态站已经能导入示例、改图、导出。

现网 VPS（无 HTTPS）见 [DEPLOY-SERVER.md](../../DEPLOY-SERVER.md)。AI 单实例契约见 [ai-production.md](ai-production.md)。

---

## 能不能上 Cloudflare？

| 目标 | 行不行 | 原因 |
|------|--------|------|
| **Cloudflare Pages** 静态演示 | 行，推荐 | 编辑器是 Vite SPA，路由用 hash，工程在 IndexedDB |
| **GitHub Pages** 静态演示 | 行，本仓库已接 workflow | 同上；项目站 base 为 `/cengfan-map-studio/` |
| **Cloudflare Workers** 跑 `server/` | 不行 | API 用 Node `http`、本地文件、内存房间、SSE，不是 Worker 运行时 |
| **Cloudflare Containers** | 能跑 Node，但不是「免费常驻」 | 按用量计费，不适合当对外主 Demo |

微信/QQ 仍可能拦截 `github.io`、未备案域名。Pages 能解决「有 HTTPS、能打开」；要进微信会话，仍需备案域名（可把 Pages 接到已备案自定义域，或给现网 8787 加 Caddy）。

---

## 静态演示里有什么

| 有 | 没有（需要本机 `npm run dev` 或自建 Node） |
|----|------------------------------------------|
| 工作台、示例项目、导入 Excel/CSV | 协作房间（内存，约 30 分钟过期） |
| 地图排版、素材、导出 PNG/SVG/工程包 | 智能助手 / 名单智能识别（要配置模型 key） |
| 工程只留在访问者自己的浏览器 | 服务端工作区 `/api/workspace` |

构建时设置 `VITE_PUBLIC_DEMO=1` 会在工作台显示说明，并链到源码（AGPL：作为网页提供给他人时须能拿到对应源码）。

---

## 1. GitHub Pages（仓库已接好）

1. GitHub 仓库 **Settings → Pages → Source** 选 **GitHub Actions**。
2. 把本分支合入 `main`（或手动跑 workflow `pages`）。
3. 打开：https://xhhemoing.github.io/cengfan-map-studio/

workflow：`.github/workflows/pages.yml`。构建环境变量：

```
BASE_PATH=/cengfan-map-studio/
VITE_PUBLIC_DEMO=1
```

**回滚**：Settings → Pages 关掉，或删掉 `pages` workflow。静态站不保存用户名单，没有数据迁移。

---

## 2. Cloudflare Pages（推荐给国内打开）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Create → Pages → Connect GitHub → 本仓库。
2. 构建设置：

| 项 | 值 |
|----|----|
| Framework preset | None |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Environment variable | `VITE_PUBLIC_DEMO=1` |

3. `BASE_PATH` **不要** 填（Pages 子域挂在根路径 `/`）。
4. 仓库里的 `wrangler.toml`、`public/_redirects`、`public/_headers` 会进 `dist`。不要加 `/* → /index.html` 的万能回退，否则 `/api/*` 会变成 200 HTML。

本地预览静态产物：

```bash
VITE_PUBLIC_DEMO=1 npm run build
npx vite preview
```

用 Wrangler 上传（需本机已登录 Cloudflare，本仓库 CI **没有** 写入 Token）：

```bash
VITE_PUBLIC_DEMO=1 npm run build
npx wrangler pages deploy dist --project-name cengfan-map-studio
```

**回滚**：Pages 项目里回退到上一部署，或断开 Git 集成。

---

## 3. 「免费常驻容器」行不行

完整能力 = 静态前端 + Node API（`npm run build && npm run start`）。容器必须：

- 能跑 Node 20+，读本地文件（`DATA_DIR`）
- **单实例**（`ai-runtime-state.json` 不能多副本同写）
- 协作房间在**进程内存**里，休眠/重启即丢

因此：

| 平台 | 适合公开参观？ | 注意 |
|------|----------------|------|
| **Render / Railway 免费实例** | 勉强当内测 | 闲置会睡；醒来后房间清空；不适合当宣发主入口 |
| **Fly.io** 小机器 | 可以挂 Dockerfile | 免费额会变；仍须单实例；生产要 `AI_BUDGET_RECEIPT_SECRET`（≥32 字符） |
| **本仓库 hermes VPS** | 已在跑 8787 | 无 HTTPS，不能当班主任主入口 |

仓库根目录 `Dockerfile` 用法：

```bash
docker build -t cengfan-map-studio .
docker run --rm -p 8787:8787 \
  -e NODE_ENV=production \
  -e AI_BUDGET_RECEIPT_SECRET="$(openssl rand -hex 24)" \
  -e AI_PUBLIC_ACCESS=1 \
  -e TRUST_PROXY=1 \
  cengfan-map-studio
```

探针：`GET /api/live`、`GET /api/ready`。反向代理后设 `TRUST_PROXY=1`。不要水平扩容。

公开参观 **不必** 开远程模型。没有 key 时助手走本地规则；公网若打开了 AI，须设 `AI_PUBLIC_ACCESS=1` 或 `WORKSPACE_API_TOKEN`（见 ai-production.md）。

---

## 验收

- [ ] 静态站 HTTPS 打开即见工作台和「示例：2026届毕业去向」
- [ ] 演示说明可见，点「源码」到 GitHub
- [ ] 改一张图能导出 PNG；刷新后项目仍在（同一浏览器）
- [ ] 点协作「创建房间」得到「没有后端接口」类提示，而不是白屏
- [ ] 若用容器：`/api/live` 200，且只有一个副本

## 破坏性变更

无。不改工程包格式、不改 API 形状。静态站本来就不调用 `/api/workspace`。
