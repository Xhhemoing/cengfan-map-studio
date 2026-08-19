# 自建部署

默认用法是本机 `npm run dev`，或 `npm run build` 后 `npm run start`。把改过的版本作为网络服务提供给他人时，须遵守 [AGPL-3.0-only](LICENSE)，向使用者提供对应源码。

生产环境变量与 AI 运行时契约见 [docs/deployment/ai-production.md](docs/deployment/ai-production.md)。密钥只放在服务器上的 `.env`，不要写进仓库。

## 构建与启动

```bash
npm ci
npm run build
NODE_ENV=production npm run start
```

健康检查：

- `GET /api/live`：进程能处理 HTTP 请求
- `GET /api/ready`：配置有效且服务未进入 draining
- `GET /api/health`：兼容摘要，不含密钥、prompt 或上游响应

## 环境变量

复制 `.env.example` 为 `.env`。生产环境至少需要：

- `AI_BUDGET_RECEIPT_SECRET`：不少于 32 个字符
- 配置远程模型时设置 `WORKSPACE_API_TOKEN`，或明确 `AI_PUBLIC_ACCESS=1`
- `DATA_DIR` 建议指向持久目录（默认 `.data`，已在 `.gitignore`）

可选：`WORKSPACE_API_TOKEN` 保护 `/api/workspace` 读写。设置后请求需带 `Authorization: Bearer <token>`。

不要把真实 API key、管理员密码或公网 IP 写进文档或提交进 Git。

## 进程托管

可用 systemd 用户服务或其他进程管理器托管 `npm run start`。unit 文件里的路径按本机安装位置编写，不要把机器专属路径提交回本仓库。

协作房间保存在进程内存中，空闲约 30 分钟过期，重启会丢失未保存的房间。AI 状态文件只支持一个写实例。
