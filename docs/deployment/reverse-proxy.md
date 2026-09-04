# 反向代理与绑定地址

自己架服务器对外提供服务时，**不要让应用端口直接对着公网**。让应用只监听回环地址，由 nginx / caddy 终止 TLS 并转发。

## 为什么

应用默认监听 `0.0.0.0`，方便本机开发与容器。但直接暴露到公网意味着：

- 没有 TLS，登录态与项目数据明文传输
- 端口扫描能直接摸到 API 与静态资源
- 反代层的限流、日志、证书续期全都用不上

## 应用侧

```bash
HOST=127.0.0.1
PORT=8787
```

`HOST` 默认为 `0.0.0.0`（保持既有部署行为不变）。设成 `127.0.0.1` 后，应用只接受本机连接。改完重启进程，用 `ss -ltn | grep 8787` 确认监听地址已变。

## nginx

```nginx
server {
    listen 80;
    server_name example.com;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # 与应用侧 JSON 上限（8MB）对齐，留一点编码余量
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # 协作房间是 SSE 长连接：必须关缓冲，并把超时放宽
        proxy_buffering off;
        proxy_read_timeout 610s;
        proxy_send_timeout 610s;
        proxy_set_header Connection "";
    }
}
```

设了 `X-Forwarded-For` 后，应用侧要一并设 `TRUST_PROXY=1`，否则限流与日志看到的都是代理 IP。

只有在**确实有反代**时才开 `TRUST_PROXY=1`：直接暴露的进程开了它，客户端就能伪造 `X-Forwarded-For` 绕过限流。

## caddy

```
example.com {
    reverse_proxy 127.0.0.1:8787 {
        flush_interval -1
    }
    request_body {
        max_size 12MB
    }
}
```

`flush_interval -1` 关掉缓冲，SSE 才能实时推送。证书由 caddy 自动申请。

## 上线自检

- [ ] `ss -ltn | grep 8787` 显示 `127.0.0.1:8787`，不是 `0.0.0.0:8787`
- [ ] 从**另一台机器** `curl http://<公网IP>:8787/api/live` 连不上
- [ ] `curl https://example.com/api/live` 返回 `{"ok":true}`
- [ ] 证书有效期与自动续期已确认
- [ ] `WORKSPACE_API_TOKEN` 已设，或明确接受 `AI_PUBLIC_ACCESS=1` 的公开访问
- [ ] 建过一次协作房间，确认 SSE 不会在几十秒后被代理掐断

## 只想要静态站

不需要协作与 AI 时，把 `npm run build` 的 `dist/` 传到任意静态托管即可，不必跑 Node 进程。见 [public-demo.md](public-demo.md)。
