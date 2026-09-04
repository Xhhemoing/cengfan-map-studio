/**
 * 进程对外暴露面的解析：监听端口与绑定网卡。
 *
 * 单独成文件而不是留在 `index.ts` 里，一是这两项是部署侧关心的入口参数，
 * 二是 `index.ts` 受 file-size-ratchet 约束，只能往下棘轮。
 */

export const DEFAULT_PORT = 8787;
export const DEFAULT_BIND_HOST = "0.0.0.0";

export function resolvePort(value: string | undefined = process.env.PORT): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_PORT;
}

/**
 * 绑定网卡。默认 `0.0.0.0` 保持既有部署与容器行为不变；放在 nginx / caddy
 * 后面时用 `HOST=127.0.0.1` 把进程收回环回地址，端口就不会直接对着公网。
 */
export function resolveBindHost(value: string | undefined = process.env.HOST): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : DEFAULT_BIND_HOST;
}
