/**
 * 静态资源服务：内容类型、缓存策略、gzip 协商、路径越界拒绝与文件流兜底，
 * 连同它们共用的响应头/JSON 应答原语。服务器主循环只负责在 API 路由未命中时调用
 * {@link serveStatic}，静态行为本身在这里成体系地可读、可测。
 */
import type http from "node:http";
import { createReadStream, statSync, type Stats } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { createGzip } from "node:zlib";

export function corsHeaders(request: http.IncomingMessage, corsOrigins: readonly string[]): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin || !corsOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key, Prefer, X-Cengfan-Room-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function sendJson(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  status: number,
  body: unknown,
  corsOrigins: readonly string[] = [],
) {
  response.writeHead(status, {
    ...securityHeaders(),
    ...corsHeaders(request, corsOrigins),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
  };
}

function cacheControlFor(filePath: string): string {
  if (filePath.endsWith("index.html")) return "no-cache";
  const hashedAssetPattern = /(?:^|[-.])[A-Za-z0-9_-]{8,}\.(?:js|css|svg|png|jpe?g|webp|ico|woff2?)$/i;
  return hashedAssetPattern.test(filePath)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=86400";
}

function acceptsGzip(request: http.IncomingMessage): boolean {
  const header = request.headers["accept-encoding"];
  const value = Array.isArray(header) ? header.join(",") : header ?? "";
  return /\bgzip\b/i.test(value);
}

/** 单次 stat：不存在、权限不足或路径非法都返回 undefined，避免同步抛错击穿请求处理。 */
function statOrUndefined(filePath: string): Stats | undefined {
  try {
    return statSync(filePath, { throwIfNoEntry: false }) ?? undefined;
  } catch {
    return undefined;
  }
}

export function serveStatic(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  staticDir: string,
  requestUrl: string,
  corsOrigins: readonly string[] = [],
): boolean {
  let urlPath: string;
  try {
    urlPath = decodeURIComponent(requestUrl.split("?")[0] || "/");
  } catch {
    sendJson(request, response, 400, {
      error: { code: "INVALID_URL_ENCODING", message: "URL 编码无效" },
    }, corsOrigins);
    return true;
  }
  if (urlPath.includes("\0")) {
    sendJson(request, response, 400, {
      error: { code: "INVALID_URL_ENCODING", message: "URL 编码无效" },
    }, corsOrigins);
    return true;
  }
  const relativePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const candidate = resolve(staticDir, relativePath);
  const root = resolve(staticDir);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    sendJson(request, response, 403, {
      error: { code: "FORBIDDEN", message: "非法路径" },
    }, corsOrigins);
    return true;
  }

  let filePath = candidate;
  let stats = statOrUndefined(filePath);
  if (!stats || stats.isDirectory()) {
    filePath = join(staticDir, "index.html");
    stats = statOrUndefined(filePath);
  }
  if (!stats || !stats.isFile()) return false;

  const shouldGzip = acceptsGzip(request)
    && /\.(?:html|js|css|json|svg)$/i.test(filePath)
    && stats.size > 128;
  const headers = {
    ...securityHeaders(),
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": cacheControlFor(filePath),
    ...(shouldGzip ? { "Content-Encoding": "gzip", "Vary": "Accept-Encoding" } : {}),
  };
  const stream = createReadStream(filePath);
  const abortTransfer = () => {
    stream.destroy();
    if (!response.writableEnded && !response.destroyed) response.destroy();
  };
  // 响应端出错时 pipe 会重新抛出，必须自己兜住；客户端提前断开时同步销毁文件流。
  response.once("error", () => { stream.destroy(); });
  response.once("close", () => { if (!response.writableEnded) stream.destroy(); });
  stream.once("error", (error: NodeJS.ErrnoException) => {
    stream.destroy();
    if (response.headersSent) {
      // 头已发出，无法再改状态码，只能中断连接而不是让未处理的流错误终止进程。
      abortTransfer();
      return;
    }
    const missing = error.code === "ENOENT" || error.code === "ENOTDIR";
    sendJson(request, response, missing ? 404 : 500, {
      error: {
        code: missing ? "NOT_FOUND" : "STATIC_READ_FAILED",
        message: missing ? "资源不存在" : "静态资源读取失败",
      },
    }, corsOrigins);
  });
  // 等到文件真正打开再发响应头，关闭 stat 与 open 之间的 TOCTOU 窗口。
  stream.once("open", () => {
    if (response.writableEnded || response.destroyed) {
      stream.destroy();
      return;
    }
    response.writeHead(200, headers);
    if (!shouldGzip) {
      stream.pipe(response);
      return;
    }
    const gzip = createGzip();
    gzip.once("error", abortTransfer);
    stream.pipe(gzip).pipe(response);
  });
  return true;
}
