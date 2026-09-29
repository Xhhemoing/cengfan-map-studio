# 静态演示与可选 Node 部署

**在线演示：[蹭饭图工作室](https://xhhemoing.github.io/cengfan-map-studio/)**。静态站可完成基础导入、编辑和导出；完整 API 是单独的部署选择。本文不承诺托管平台价格、免费额度或特定地区的网络可达性。

## 能力边界

| 静态构建 | 需要单独运行 Node API |
| --- | --- |
| 工作台、内置虚构示例、Excel/CSV 导入 | 协作房间与服务端工作区 |
| 地图与卡片编辑、PNG/SVG/JSON 工程包导出 | 配置模型后的远程 AI 能力 |
| 当前浏览器 IndexedDB 保存 | 服务端持久目录、访问控制与运维 |

`VITE_PUBLIC_DEMO=1` 标记静态演示模式，展示说明并限制需要后端的入口。名单仍需使用者自行备份；换域名、浏览器或清理站点数据不会自动迁移项目。API 缺失不应被伪装成返回 HTML 的成功响应。

## 1. 使用 Release 静态包

下载同一 Release 的 `*-web.zip` 或 `*-web.tar.gz`、`BUILD_INFO.json` 和 `SHA256SUMS.txt`，按 [发布说明](../RELEASING.md) 核对完整性。包内站点使用根路径 `/`，解压后用 HTTP/HTTPS 静态服务器托管，不通过双击 HTML 的 `file://` 协议运行。

该包不包含 Node API。需要项目子路径时应从对应 tag 源码重建，并设置正确的 `BASE_PATH`。

## 2. 从源码构建

Node 22.13+（22.x）、npm 10+；以下命令用于 POSIX shell：

```bash
npm ci
VITE_PUBLIC_DEMO=1 BASE_PATH=/ npm run build
npx vite preview
```

输出目录为 `dist/`。`npm run preview` 实际启动完整 Node 服务，不能替代这里的 `npx vite preview`。应用服务器代码依赖 Node HTTP 和本地文件，不能直接当作 Workers 脚本上传。

## 3. GitHub Pages

仓库工作流为 `.github/workflows/pages.yml`。仓库 Settings → Pages 的发布来源应选 GitHub Actions。

`main` 的 push 产生开发预览；手动执行 `pages` 时可用 `source_ref` 选择明确的 tag 或 commit。Release 工作流发布成功后会显式请求从该版本 tag 部署，部署结果需要另行核对。

项目站构建变量：

```text
BASE_PATH=/cengfan-map-studio/
VITE_PUBLIC_DEMO=1
```

回滚时重新运行 `pages`，将 `source_ref` 设置为已知可用的旧 tag，而不是删除工作流。回滚静态程序不代表恢复或迁移访问者的本地数据。

## 4. 其他静态托管（如 Cloudflare Pages）

选择 Node 22 构建环境，构建命令 `npm ci && npm run build`，输出目录 `dist`，环境变量 `VITE_PUBLIC_DEMO=1` 和 `BASE_PATH=/`。自定义子路径时相应调整 BASE_PATH。

仓库内的 `public/_headers`、`public/_redirects` 供兼容的静态托管平台使用，Vite 会复制 public 资源；`wrangler.toml` 是仓库根的部署配置，并不会被当成 public 文件自动复制。托管平台的具体账户、域名和访问策略需另行配置，本仓库不内置这些凭证。

不要配置把所有 `/api/*` 请求改写为 200 HTML 的兜底规则。HTTPS、应用访问控制和某个客户端是否允许访问是不同事项；上线前按实际目标网络验证。

## 5. 完整 Node / Docker

先读 [自建部署](../../DEPLOY-SERVER.md)、[AI 生产契约](ai-production.md) 和 [反向代理](reverse-proxy.md)。完整服务需要生产密钥，即使没有启用远程模型也不能省略。复制 `.env.example` 为 `.env` 并填写至少 32 字符的 `AI_BUDGET_RECEIPT_SECRET`；使用远程模型时还要配置 `WORKSPACE_API_TOKEN`。不要将 `.env` 放进镜像或 Git。

```bash
docker build -t cengfan-map-studio .
docker run --rm --name cengfan-map-studio \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e AI_PUBLIC_ACCESS=0 \
  -e TRUST_PROXY=0 \
  -v cengfan-data:/app/.data \
  cengfan-map-studio
```

容器内部监听 `0.0.0.0` 使端口映射可达，宿主机只在 `127.0.0.1:8787` 发布端口；由同机反向代理对外提供 HTTPS。在确认可信代理链后才决定是否启用 TRUST_PROXY，不应默认开启。改变 PORT 或数据路径时需同步修改映射、探针或挂载。

使用单实例与持久卷。协作房间有运行态、快照恢复和过期规则；AI 状态使用文件持久化。休眠、异常退出和过期都可能影响恢复，不承诺每次事件已落盘，也不要水平扩容到多个写实例。

## 上线验收

- [ ] HTTPS 下可打开工作台，演示模式说明和源码入口正确。
- [ ] 用虚构名单完成导入、编辑和 PNG 导出；同一浏览器刷新后项目仍在。
- [ ] 静态模式下需要后端的入口正确降级，没有将 HTML 当作 API JSON。
- [ ] 路径前缀、资源加载和未知页面行为符合所选托管方式。
- [ ] Node 部署的 `/api/live`、`/api/ready` 正常，应用端口不直接暴露公网，只有一个写实例。
- [ ] 已验证备份与受控重启；未把虚构示例、隐藏姓名或浏览器保存误当成匿名分享或云备份。
