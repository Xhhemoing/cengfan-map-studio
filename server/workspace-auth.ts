import { timingSafeEqual } from "node:crypto";
import type http from "node:http";
import { sendJson } from "./http-utils";

function authorizationToken(request: http.IncomingMessage): string | null {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim() || null;
  const apiKey = request.headers["x-api-key"];
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
}

export function hasApiToken(request: http.IncomingMessage, token: string | undefined): boolean {
  const provided = authorizationToken(request);
  if (!token || !provided) return false;
  const expectedBytes = Buffer.from(token);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export function requestApiAuth(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  corsOrigins: readonly string[],
  token: string | undefined,
  requestId: string,
): void {
  const configured = Boolean(token);
  sendJson(request, response, configured ? 401 : 503, {
    error: {
      code: configured ? "UNAUTHORIZED" : "WORKSPACE_API_DISABLED",
      message: configured ? "需要有效的 API token" : "工作区 API 未配置访问 token",
    },
  }, corsOrigins, requestId);
}
