# 自建部署

需要协作、服务端工作区或远程 AI 时才需要完整 Node 服务。只使用导入、编辑和导出，可选择 [静态部署](docs/deployment/public-demo.md)，不必运行 API。

使用明确的 Release tag 构建，环境为 Node 22.13+（22.x）、npm 10+。代码许可证沿用 [AGPL-3.0-only](LICENSE)，部署与再分发须遵循许可证全文及第三方权利说明。不要把修改后的构建与对应源码脱离。

## 配置与启动

```bash
npm ci
cp .env.example .env
# 先编辑 .env，填写下面的生产配置；不要提交该文件
npm run build
NODE_ENV=production HOST=127.0.0.1 npm run start
```

以上环境变量写法用于 POSIX shell。服务端会读取 `.env`；已有进程环境变量优先。生产环境必须设置 `AI_BUDGET_RECEIPT_SECRET`，至少 32 个字符，即使没有配置远程模型也需要。可在服务器上用 `openssl rand -hex 32` 生成并安全保存，不要将输出粘贴到公开日志、Issue 或仓库。

| 配置 | 建议与边界 |
| --- | --- |
| `HOST=127.0.0.1` | 原生进程位于同机反向代理之后时使用，避免应用端口直接暴露；程序未配置时仍默认 `0.0.0.0` |
| `PORT=8787` | API 与静态前端服务端口 |
| `AI_BUDGET_RECEIPT_SECRET` | 至少 32 字符的私密、持久配置 |
| `AI_PUBLIC_ACCESS=0` | 不默认开放匿名公网 AI；配置远程模型时，同时设置工作区 token |
| `WORKSPACE_API_TOKEN` | 保护工作区 API，并用于未开放匿名访问时的 AI 访问策略；请求使用 `Authorization: Bearer <token>` |
| `TRUST_PROXY=0` | 不默认信任转发头；仅在验证可信代理链与网络隔离后显式启用 |
| `DATA_DIR` / `AI_STATE_FILE` | 单实例持久目录与 AI 状态文件；更改目录时同步检查具体文件路径，不假设路径会自动迁移 |

模型密钥放在服务端变量中，不放入 `VITE_*`，也不要传到浏览器。远程 AI 及生产校验契约见 [ai-production.md](docs/deployment/ai-production.md)。不要为了让启动校验通过而随意打开 `AI_PUBLIC_ACCESS=1`。

## HTTPS 与进程托管

外部访问由 nginx / caddy 等反向代理终止 TLS。按 [反向代理说明](docs/deployment/reverse-proxy.md) 配置长连接、关闭 SSE 缓冲并验证可信代理边界。反代本身不等于应用已具有完整访问控制；按使用范围配置相应认证和网络限制。

可使用 systemd 或其他进程管理器托管 `npm run start`。服务用户应仅拥有运行与读写持久目录所需权限。机器路径、密钥和生产地址不提交回仓库。

Docker 示例见 [公开演示与容器部署](docs/deployment/public-demo.md)。容器内部需要监听可映射的网卡，但宿主机发布端口仍应绑定回环；不要混淆这两个地址。

## 健康检查与数据

- `GET /api/live`：进程可以处理 HTTP 请求。
- `GET /api/ready`：配置有效且服务没有进入 draining。
- `GET /api/health`：兼容健康摘要，不输出密钥或上游响应。

```bash
curl --fail http://127.0.0.1:8787/api/live
curl --fail http://127.0.0.1:8787/api/ready
```

浏览器项目默认在访问者的 IndexedDB，不因为启动 Node 就自动成为云备份。协作房间有内存运行态和文件快照恢复：受控关停时保存，启动恢复未过期房间，默认闲置过期规则继续生效；不保证异常终止前所有修改已落盘。AI 状态与协作持久目录按单实例设计，不要多个副本同时写入同一组文件。

升级前导出浏览器工程包，并备份服务端持久目录及私密配置。工程包可能包含完整学生名单，备份也应受访问控制。回滚应用不能恢复已经删除的浏览器数据。发布与回滚步骤见 [RELEASING](docs/RELEASING.md)。
