import type http from "node:http";

export const HTTP_ERROR_CODES = {
  invalidJson: "INVALID_JSON",
  requestTooLarge: "REQUEST_TOO_LARGE",
  validation: "VALIDATION_ERROR",
  internal: "INTERNAL_ERROR",
} as const;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("请求体过大");
  }
}

export class InvalidJsonError extends Error {
  constructor() {
    super("请求 JSON 格式无效");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function positiveByteLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

export function requestIdFor(request: http.IncomingMessage): string {
  const header = request.headers["x-request-id"];
  return typeof header === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(header)
    ? header
    : `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
  };
}

export function apiSecurityHeaders(): Record<string, string> {
  return {
    ...securityHeaders(),
    "Cache-Control": "no-store",
  };
}

export function sendJson(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  status: number,
  body: unknown,
  corsOrigins: readonly string[] = [],
  requestId?: string,
): void {
  const responseBody = status >= 400 && requestId && isRecord(body)
    ? { ...body, requestId }
    : body;
  response.writeHead(status, {
    ...apiSecurityHeaders(),
    ...corsHeaders(request, corsOrigins),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(responseBody));
}

export function createJsonSender(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  corsOrigins: readonly string[],
  requestId: string,
): (status: number, body: unknown) => void {
  return (status, body) => sendJson(request, response, status, body, corsOrigins, requestId);
}

export async function readJson(request: http.IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidJsonError();
  }
}
