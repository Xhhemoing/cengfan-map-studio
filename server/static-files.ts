import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import type http from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { createGzip } from "node:zlib";
import { securityHeaders, sendJson } from "./http-utils";

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
  let hasExplicitGzip = false;
  let gzipAccepted = false;
  let gzipRejected = false;
  let wildcardAccepted = false;

  for (const entry of value.split(",")) {
    const [encoding, ...parameters] = entry.split(";").map((part) => part.trim());
    const normalizedEncoding = encoding?.toLowerCase();
    if (normalizedEncoding !== "gzip" && normalizedEncoding !== "*") continue;
    const quality = parameters.find((parameter) => parameter.toLowerCase().startsWith("q="));
    const parsed = quality ? Number(quality.slice(2).trim()) : 1;
    const accepted = Number.isFinite(parsed) && parsed > 0 && parsed <= 1;

    if (normalizedEncoding === "gzip") {
      hasExplicitGzip = true;
      if (accepted) gzipAccepted = true;
      else gzipRejected = true;
    } else if (accepted) {
      wildcardAccepted = true;
    }
  }

  if (gzipRejected) return false;
  return hasExplicitGzip ? gzipAccepted : wildcardAccepted;
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

export function serveStatic(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  staticDir: string,
  requestUrl: string,
  corsOrigins: readonly string[] = [],
  requestId?: string,
): boolean {
  let urlPath: string;
  try {
    urlPath = decodeURIComponent(requestUrl.split("?")[0] || "/");
  } catch {
    sendJson(request, response, 400, {
      error: { code: "INVALID_URL_ENCODING", message: "URL 编码无效" },
    }, corsOrigins, requestId);
    return true;
  }
  const relativePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const candidate = resolve(staticDir, relativePath);
  const root = resolve(staticDir);
  if (!isWithinRoot(root, candidate)) {
    sendJson(request, response, 403, {
      error: { code: "FORBIDDEN", message: "非法路径" },
    }, corsOrigins, requestId);
    return true;
  }

  if (!existsSync(root)) return false;
  const realRoot = realpathSync(root);
  let filePath: string;
  if (existsSync(candidate)) {
    const realCandidate = realpathSync(candidate);
    if (!isWithinRoot(realRoot, realCandidate)) {
      sendJson(request, response, 403, {
        error: { code: "FORBIDDEN", message: "非法路径" },
      }, corsOrigins, requestId);
      return true;
    }
    filePath = statSync(realCandidate).isDirectory() ? join(root, "index.html") : realCandidate;
  } else {
    filePath = join(root, "index.html");
  }
  if (!existsSync(filePath)) return false;
  filePath = realpathSync(filePath);
  if (!isWithinRoot(realRoot, filePath)) {
    sendJson(request, response, 403, {
      error: { code: "FORBIDDEN", message: "非法路径" },
    }, corsOrigins, requestId);
    return true;
  }
  if (!statSync(filePath).isFile()) return false;

  const gzipEligible = /\.(?:html|js|css|json|svg)$/i.test(filePath)
    && statSync(filePath).size > 128;
  const shouldGzip = gzipEligible && acceptsGzip(request);
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": cacheControlFor(filePath),
    ...(gzipEligible ? { Vary: "Accept-Encoding" } : {}),
    ...(shouldGzip ? { "Content-Encoding": "gzip" } : {}),
  });
  const stream = createReadStream(filePath);
  if (shouldGzip) stream.pipe(createGzip()).pipe(response);
  else stream.pipe(response);
  return true;
}
