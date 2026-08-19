# 蹭饭图 · 服务器部署与 API 配置

> 若只想给大家打开编辑器参观：用静态站（Cloudflare Pages / GitHub Pages），见 [docs/deployment/public-demo.md](docs/deployment/public-demo.md)。本文是带 Node API 的 VPS 部署。

> 部署目标:121.5.16.236 (hermes) · Ubuntu 24.04 · Node v24.18.0
> 项目路径:`/home/ubuntu/work/蹭饭图` · 服务端口:`8787`

## 一、当前运行状态(2026-08-07)

| 项目 | 状态 |
|---|---|
| 代码版本 | `b350c5f`(GitHub main,已同步) |
| 依赖 | `npm ci` 全新安装,0 漏洞,xlsx 0.20.3 |
| 构建 | `npm run build` 成功(前端 + API 同服务) |
| 服务 | systemd 用户服务 `cengfan-8787`,enabled + linger |
| 探针 | `/api/live` 200 · `/api/ready` 200 · `/api/health` 200 |
| AI | 远程 key **已耗尽**(需更换),自动回退本地规则 |

## 二、API 配置(关键!)

编辑 `/home/ubuntu/work/蹭饭图/.env`:

```bash
cd /home/ubuntu/work/蹭饭图 && nano .env
```

### 1. 更换有效的 AI 密钥(当前失效)

```env
AI_API_KEY=sk-你的新密钥
AI_BASE_URL=https://api.deepseek.com/v1        # 或你的 OpenAI 兼容端点
AI_MODEL=deepseek-chat
```

> 也支持多级配置:`AI_PRIMARY_*`(主模型)、`AI_FALLBACK_*`(备选)。
> 只填 `AI_API_KEY` 时 agent 主模型会自动回退到它。

### 2. 生产必填项(已配置,一般不用动)

```env
NODE_ENV=production
AI_BUDGET_RECEIPT_SECRET=<已生成40字符随机串>   # 会话回执签名,重启后续聊有效
AI_PUBLIC_ACCESS=1                            # 1=允许无 token 的公网 AI 请求
TRUST_PROXY=0                                 # 未用反向代理保持 0
DATA_DIR=.data
SHUTDOWN_TIMEOUT_MS=10000
```

### 3. 管理后台(可选)

管理员用户名/密码在 `/home/ubuntu/.config/cengfan/admin.env`:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<你的密码>
```

后台页面 `http://<IP>:8787/admin`,访问统计 `GET /api/admin/visits`。

### 4. 工作区 API token(可选,保护 /api/workspace 读写)

```env
WORKSPACE_API_TOKEN=<随机长字符串>
```

> 注意:设置后 `GET/PUT /api/workspace` 需要 `Authorization: Bearer <token>`。
> `AI_PUBLIC_ACCESS=1` 时 AI 端点不要求此 token。

### 5. 修改后重启

```bash
systemctl --user restart cengfan-8787
journalctl --user -u cengfan-8787 -n 20     # 查看日志
```

## 三、日常运维

```bash
# 查看状态
systemctl --user status cengfan-8787
curl http://127.0.0.1:8787/api/health

# 更新代码(服务器可直连 npm,但 GitHub 直连不稳,从本地打包上传)
# 本地: tar czf /tmp/deploy.tgz --exclude=node_modules --exclude=.git --exclude=.data .
# 服务器: tar xzf deploy.tgz && npm ci && npm run build && systemctl --user restart cengfan-8787

# 备份数据(房间/访问统计/工作区/回执)
tar czf ~/backups/cengfan-data-$(date +%F).tgz /home/ubuntu/work/蹭饭图/.data

# 回滚: 恢复到上一个构建
# git checkout <上一版本> && npm ci && npm run build && systemctl --user restart cengfan-8787
```

## 四、已知边界

- **单实例部署契约**:`ai-runtime-state.json` 只支持一个写实例,不要开多个副本。
- 协作房间是进程内内存,空闲 30 分钟过期;重启会丢失未保存的房间。
- 当前服务器内存仅 1.9G,构建和运行已够用,但勿同时跑多个重型服务。
- 公网直连 8787(无 HTTPS、无反向代理)。如需 HTTPS 建议加 Caddy/Nginx 反代。
