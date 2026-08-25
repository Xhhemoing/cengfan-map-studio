# 静态 Demo（前端即可试用）

名单默认在浏览器 IndexedDB，不经过服务器。把 `npm run build` 的前端静态资源挂到 HTTPS 上，就是可分享的试用入口。AI 助手和协作房间需要 API，Demo 可以没有这两项。

## 构建

```bash
npm ci
npm run build
```

产物在 `dist/`（或构建脚本写出的前端目录）。按单页应用回退：所有路径回到 `index.html`。

## Cloudflare Pages（国内微信较稳）

1. 用 GitHub 仓库接入 Cloudflare Pages
2. 构建命令：`npm run build`
3. 输出目录：`dist`
4. 自定义域名前，先用 `*.pages.dev` 做内测
5. 打开后应能进入工作台、打开「示例：2026届毕业去向」、导出 PNG

## GitHub Pages

仓库 Settings → Pages → GitHub Actions，用官方「静态文件 / SPA」工作流发布 `dist/`。国内访问不稳定，只作开发者备链。

## 不要用现网 IP 当主入口

`http://公网IP:8787` 会被微信/QQ 拦截，也没有 HTTPS。现网适合内测，不能写进小红书/视频号正文。

## 验收

- 手机浏览器打开 HTTPS 链接，无需登录
- 示例项目可导出
- 页面不要求填写 AI key
- 合规：示例姓名已脱敏；不出现真实姓名 + 去向
