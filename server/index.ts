import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createBudgetReceiptLedger, createBudgetReceiptSigner, type BudgetReceiptLedger } from "./ai/budget-receipt";
import { createFileAiStateStore, createMemoryAiStateStore, emptyAiRuntimeState, type AiRuntimeState, type AiStateStore } from "./ai/ai-state-store";
import { createServerLifecycle, validateProductionConfig } from "./production";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

import {
  createAiBackend,
  resolveAiConfig,
  type AiBackend,
  type AiConfig,
} from "./ai/llm-client";
import { createAgentLoopBackend, normalizeAgentRuntimeConfig, resolveAgentConfig, resolveAgentRuntimeConfig, type AgentRuntimeConfig } from "./ai/agent-routing";
import { parseAgentRequest } from "./ai/agent-request";
import { digestFingerprint } from "./ai/agent-loop";
import { createRateLimiter } from "./ai/rate-limit";
import { createAiLogger } from "./ai/ai-observability";
import { parseDataRequestSchema } from "./ai/schemas";
import { CollaborationError, createRoomStore } from "./collaboration";

export const DEFAULT_PORT = 8787;
export type AiServer = http.Server & { flushAiState?: () => Promise<void>; lifecycle?: ReturnType<typeof createServerLifecycle> };

export function resolvePort(value: string | undefined = process.env.PORT): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_PORT;
}
const DEFAULT_DATA_DIR = fileURLToPath(new URL("../.data", import.meta.url));
function createAgentTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 只透传工具名，工具参数与结果始终不进日志。 */
function agentToolNames(outcome: { kind: string; calls?: Array<{ name: string }> }): string[] | undefined {
  if (outcome.kind === "tool-call") return outcome.calls?.map((call) => call.name);
  return outcome.kind === "finish" ? ["finish"] : undefined;
}

const IP_LITERAL = /^[0-9a-fA-F.:]{2,45}$/;

/**
 * 限流键取 X-Forwarded-For 的最后一跳:受信代理把它看到的对端地址追加在末尾,
 * 客户端能伪造的内容只可能排在前面。取第一个值等于让任何人自选限流键,一行 header 就能绕开配额。
 * 最后一跳不是合法 IP 字面量(代理没配好 / 直连伪造)时退回 socket 地址,不给攻击者塞任意长键的机会。
 * 回滚:把取值改回 value.split(",")[0] 即可恢复旧行为。
 */
function clientIp(request: http.IncomingMessage, trustProxy: boolean): string {
  const socketIp = (request.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
  if (!trustProxy) return socketIp;
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded ?? "";
  const hops = value.split(",").map((hop) => hop.trim()).filter(Boolean);
  const lastHop = hops[hops.length - 1]?.replace(/^::ffff:/, "");
  return lastHop && IP_LITERAL.test(lastHop) ? lastHop : socketIp;
}

function retryAfterSeconds(retryAfterMs: number | undefined, fallbackMs: number): number {
  const ms = retryAfterMs !== undefined && retryAfterMs > 0 ? retryAfterMs : fallbackMs;
  return Math.max(1, Math.ceil(ms / 1000));
}

export interface AiServerOptions {
  staticDir?: string;
  dataDir?: string;
  workspaceApiToken?: string;
  corsOrigins?: string[];
  aiConfig?: AiConfig;
  agentConfig?: AiConfig | AgentRuntimeConfig;
  rateLimiters?: {
    agent?: ReturnType<typeof createRateLimiter>;
    otherAi?: ReturnType<typeof createRateLimiter>;
    rooms?: ReturnType<typeof createRateLimiter>;
    roomTickets?: ReturnType<typeof createRateLimiter>;
  };
  aiLogger?: ReturnType<typeof createAiLogger>;
  maxJsonBodyBytes?: number;
  maxWorkspaceBytes?: number;
  maxRooms?: number;
  maxRoomSubscribers?: number;
  roomTtlMs?: number;
  roomInvitationTtlMs?: number;
  roomEventsTicketTtlMs?: number;
  maxRoomEventsTickets?: number;
  maxRoomEventsTicketsPerRoom?: number;
  trustProxy?: boolean;
  budgetReceiptSecret?: string;
  budgetReceiptLedger?: BudgetReceiptLedger;
  aiStateStore?: AiStateStore;
  aiRuntimeState?: AiRuntimeState;
  rateLimitOptions?: {
    agent?: { limit: number; windowMs: number; maxEntries?: number };
    otherAi?: { limit: number; windowMs: number; maxEntries?: number };
    rooms?: { limit: number; windowMs: number; maxEntries?: number };
    roomTickets?: { limit: number; windowMs: number; maxEntries?: number };
  };
  onAiStateUnavailable?: () => void;
  productionConfig?: ReturnType<typeof validateProductionConfig>;
}

const DEFAULT_MAX_JSON_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ROOM_TRANSACTION_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_AI_BODY_BYTES = 512 * 1024;
const DEFAULT_MAX_ROOMS = 100;
const DEFAULT_MAX_ROOM_SUBSCRIBERS = 50;
const DEFAULT_ROOM_TTL_MS = 30 * 60 * 1000;
const DEFAULT_ROOM_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ROOM_EVENTS_TICKET_TTL_MS = 60 * 1000;
const DEFAULT_MAX_ROOM_EVENTS_TICKETS = 10_000;
const DEFAULT_MAX_ROOM_EVENTS_TICKETS_PER_ROOM = 200;
const DEFAULT_ROOM_TICKET_RATE_LIMIT = 120;
/** 房间侧 429(房间数/订阅数上限)没有精确的窗口剩余时间,给一个保守的重试提示。 */
const DEFAULT_ROOM_RETRY_AFTER_MS = 30_000;

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("请求体过大");
  }
}

class InvalidJsonError extends Error {
  constructor() {
    super("请求 JSON 格式无效");
  }
}

function authorizationToken(request: http.IncomingMessage): string | null {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim() || null;
  const apiKey = request.headers["x-api-key"];
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
}

function hasApiToken(request: http.IncomingMessage, token: string | undefined): boolean {
  const provided = authorizationToken(request);
  if (!token || !provided) return false;
  const expectedBytes = Buffer.from(token);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

function requestApiAuth(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  corsOrigins: readonly string[],
  token: string | undefined,
) {
  const configured = Boolean(token);
  sendJson(request, response, configured ? 401 : 503, {
    error: {
      code: configured ? "UNAUTHORIZED" : "WORKSPACE_API_DISABLED",
      message: configured ? "需要有效的 API token" : "工作区 API 未配置访问 token",
    },
  }, corsOrigins);
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkspaceSnapshot(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const record = value as Record<string, unknown>;
  return record.kind === "cengfan-workspace"
    && record.version === 1
    && Boolean(record.projectPackage)
    && typeof record.projectPackage === "object"
    && !Array.isArray(record.projectPackage);
}

function corsHeaders(request: http.IncomingMessage, corsOrigins: readonly string[]): Record<string, string> {
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

function sendJson(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  status: number,
  body: unknown,
  corsOrigins: readonly string[] = [],
  extraHeaders: Record<string, string> = {},
) {
  response.writeHead(status, {
    ...securityHeaders(),
    ...corsHeaders(request, corsOrigins),
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
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

function securityHeaders(): Record<string, string> {
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


async function readJson(request: http.IncomingMessage, maxBytes: number): Promise<unknown> {
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
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InvalidJsonError();
  }
}


function serveStatic(
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
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    const fallback = join(staticDir, "index.html");
    if (!existsSync(fallback)) {
      return false;
    }
    filePath = fallback;
  }

  const shouldGzip = acceptsGzip(request)
    && /\.(?:html|js|css|json|svg)$/i.test(filePath)
    && statSync(filePath).size > 128;
  response.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": cacheControlFor(filePath),
    ...(shouldGzip ? { "Content-Encoding": "gzip", "Vary": "Accept-Encoding" } : {}),
  });
  const stream = createReadStream(filePath);
  if (shouldGzip) stream.pipe(createGzip()).pipe(response);
  else stream.pipe(response);
  return true;
}

export function createAiServer(options: AiServerOptions = {}) {
  const staticDir = options.staticDir ? resolve(options.staticDir) : undefined;
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? DEFAULT_DATA_DIR);
  const workspaceApiToken = options.workspaceApiToken ?? process.env.WORKSPACE_API_TOKEN;
  const productionConfig = options.productionConfig ?? validateProductionConfig(process.env);
  const corsOrigins = options.corsOrigins ?? (process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  const aiConfig = options.aiConfig ?? resolveAiConfig();
  const ai: AiBackend = createAiBackend(aiConfig);
  const budgetReceipts = createBudgetReceiptSigner(options.budgetReceiptSecret ?? process.env.AI_BUDGET_RECEIPT_SECRET);
  const stateStore = options.aiStateStore ?? createMemoryAiStateStore(options.aiRuntimeState ?? emptyAiRuntimeState(), { ready: true });
  const restoredState = options.aiRuntimeState ?? emptyAiRuntimeState();
  let aiStateUnavailable = false;
  const enqueueStateUpdate = (mutator: (state: AiRuntimeState) => AiRuntimeState) => {
    void stateStore.update(mutator).catch(() => {
      aiStateUnavailable = true;
      options.onAiStateUnavailable?.();
    });
  };
  const budgetReceiptLedger = options.budgetReceiptLedger ?? createBudgetReceiptLedger(budgetReceipts, {
    restored: restoredState.budgetLedger,
    onChange: (snapshot) => enqueueStateUpdate((state) => ({ ...state, budgetLedger: snapshot })),
  });
  const agentRuntime: AgentRuntimeConfig = options.agentConfig && "maxRounds" in options.agentConfig
    ? normalizeAgentRuntimeConfig(options.agentConfig)
    : options.agentConfig
      ? normalizeAgentRuntimeConfig({
        primary: options.agentConfig.apiKey ? options.agentConfig : undefined,
        fallback: undefined,
        maxRounds: 20,
        tokenBudget: 60_000,
        retryMaxAttempts: options.agentConfig.retryMaxAttempts ?? 2,
        retryBaseDelayMs: options.agentConfig.retryBaseDelayMs ?? 250,
      })
      : resolveAgentRuntimeConfig();
  const agent = createAgentLoopBackend(agentRuntime);
  const agentRateLimiter = options.rateLimiters?.agent ?? createRateLimiter({
    limit: options.rateLimitOptions?.agent?.limit ?? 30,
    windowMs: options.rateLimitOptions?.agent?.windowMs ?? 60_000,
    maxEntries: options.rateLimitOptions?.agent?.maxEntries,
    restored: restoredState.rateLimits.agent,
    onChange: (snapshot) => enqueueStateUpdate((state) => ({ ...state, rateLimits: { ...state.rateLimits, agent: snapshot } })),
  });
  const otherAiRateLimiter = options.rateLimiters?.otherAi ?? createRateLimiter({
    limit: options.rateLimitOptions?.otherAi?.limit ?? 20,
    windowMs: options.rateLimitOptions?.otherAi?.windowMs ?? 60_000,
    maxEntries: options.rateLimitOptions?.otherAi?.maxEntries,
    restored: restoredState.rateLimits.otherAi,
    onChange: (snapshot) => enqueueStateUpdate((state) => ({ ...state, rateLimits: { ...state.rateLimits, otherAi: snapshot } })),
  });
  const roomCreateRateLimiter = options.rateLimiters?.rooms ?? createRateLimiter({
    limit: options.rateLimitOptions?.rooms?.limit ?? 20,
    windowMs: options.rateLimitOptions?.rooms?.windowMs ?? 60_000,
    maxEntries: options.rateLimitOptions?.rooms?.maxEntries,
  });
  // SSE 每次(重)连都要换一张 ticket,配额留得比重连节奏宽:限的是狂铸,不是正常重连。
  const roomTicketRateLimiter = options.rateLimiters?.roomTickets ?? createRateLimiter({
    limit: options.rateLimitOptions?.roomTickets?.limit ?? DEFAULT_ROOM_TICKET_RATE_LIMIT,
    windowMs: options.rateLimitOptions?.roomTickets?.windowMs ?? 60_000,
    maxEntries: options.rateLimitOptions?.roomTickets?.maxEntries,
  });
  const aiLogger = options.aiLogger ?? createAiLogger();
  const maxJsonBodyBytes = options.maxJsonBodyBytes ?? DEFAULT_MAX_JSON_BODY_BYTES;
  const maxWorkspaceBytes = options.maxWorkspaceBytes ?? Number(process.env.MAX_WORKSPACE_BYTES ?? DEFAULT_MAX_WORKSPACE_BYTES);
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === "1";
  const workspaceFile = join(dataDir, "workspace.json");
  const roomStore = createRoomStore({
    maxRooms: options.maxRooms ?? Number(process.env.MAX_ROOMS ?? DEFAULT_MAX_ROOMS),
    maxSubscribers: options.maxRoomSubscribers ?? Number(process.env.MAX_ROOM_SUBSCRIBERS ?? DEFAULT_MAX_ROOM_SUBSCRIBERS),
    roomTtlMs: options.roomTtlMs ?? Number(process.env.ROOM_TTL_MS ?? DEFAULT_ROOM_TTL_MS),
    invitationTtlMs: options.roomInvitationTtlMs ?? DEFAULT_ROOM_INVITATION_TTL_MS,
  });
  const roomEventsTicketTtlMs = options.roomEventsTicketTtlMs ?? DEFAULT_ROOM_EVENTS_TICKET_TTL_MS;
  const roomEventsTickets = new Map<string, { roomId: string; accessToken: string; expiresAt: number }>();
  // 每个房间独立计数：全局池被单个房间铸满会让全服 SSE 都换不到 ticket，
  // 分池后狂铸的房间先撞自己的上限，其他房间照常签发。
  const roomEventsTicketCounts = new Map<string, number>();
  const maxRoomEventsTickets = Math.max(1, Math.floor(options.maxRoomEventsTickets ?? DEFAULT_MAX_ROOM_EVENTS_TICKETS));
  const maxRoomEventsTicketsPerRoom = Math.max(1, Math.floor(options.maxRoomEventsTicketsPerRoom ?? DEFAULT_MAX_ROOM_EVENTS_TICKETS_PER_ROOM));
  const dropRoomEventsTicket = (ticket: string) => {
    const record = roomEventsTickets.get(ticket);
    if (!record) return;
    roomEventsTickets.delete(ticket);
    const remaining = (roomEventsTicketCounts.get(record.roomId) ?? 1) - 1;
    if (remaining > 0) roomEventsTicketCounts.set(record.roomId, remaining);
    else roomEventsTicketCounts.delete(record.roomId);
  };
  const evictExpiredTickets = () => {
    const now = Date.now();
    for (const [ticket, record] of roomEventsTickets) {
      if (record.expiresAt <= now) dropRoomEventsTicket(ticket);
    }
  };
  const storeRoomEventsTicket = (ticket: string, record: { roomId: string; accessToken: string; expiresAt: number }) => {
    const roomCount = () => roomEventsTicketCounts.get(record.roomId) ?? 0;
    if (roomEventsTickets.size >= maxRoomEventsTickets || roomCount() >= maxRoomEventsTicketsPerRoom) {
      evictExpiredTickets();
    }
    // 拒绝新 ticket，防止内存被恶意请求撑满：房间配额先撞顶，全局池才是最后一道闸。
    if (roomCount() >= maxRoomEventsTicketsPerRoom || roomEventsTickets.size >= maxRoomEventsTickets) return false;
    roomEventsTickets.set(ticket, record);
    roomEventsTicketCounts.set(record.roomId, roomCount() + 1);
    return true;
  };
  const flushAiState = async () => {
    try {
      await stateStore.flush();
    } catch (error) {
      aiStateUnavailable = true;
      throw error;
    }
  };

  const server = http.createServer(async (request, response) => {
    const send = (status: number, body: unknown) => sendJson(request, response, status, body, corsOrigins);
    // 429 一律带 Retry-After(整秒)：客户端不必自己猜退避窗口，错误码保持不变。
    const sendThrottled = (status: number, body: unknown, retryAfterMs: number | undefined, fallbackMs: number) =>
      sendJson(request, response, status, body, corsOrigins, { "Retry-After": String(retryAfterSeconds(retryAfterMs, fallbackMs)) });
    const url = request.url || "/";
    const pathname = new URL(url, "http://localhost").pathname;
    const requestIdHeader = request.headers["x-request-id"];
    const suppliedRequestId = typeof requestIdHeader === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(requestIdHeader) ? requestIdHeader : "";
    const requestId = suppliedRequestId || `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const sendAi = (status: number, body: unknown) => send(status, { ...(isRecord(body) ? body : {}), requestId });
    const aiPath = pathname.startsWith("/api/ai/");
    const aiRequiresToken = productionConfig.config?.nodeEnv === "production"
      && !productionConfig.config?.aiPublicAccess
      && Boolean(workspaceApiToken);
    if (aiPath && request.method === "POST" && aiRequiresToken && !hasApiToken(request, workspaceApiToken)) {
      requestApiAuth(request, response, corsOrigins, workspaceApiToken);
      return;
    }
    const aiLimiter = pathname === "/api/ai/agent" ? agentRateLimiter : otherAiRateLimiter;
    const aiLimit = aiPath && request.method === "POST" ? aiLimiter.check(clientIp(request, trustProxy)) : null;
    if (aiPath && request.method === "POST" && aiStateUnavailable) {
      sendAi(503, { error: { code: "AI_STATE_UNAVAILABLE", message: "AI 状态暂时不可用" } });
      return;
    }
    if (aiLimit && !aiLimit.allowed) {
      aiLogger.log("ai.rate_limited", { requestId, errorCode: "AI_RATE_LIMITED" });
      sendThrottled(429, { error: { code: "AI_RATE_LIMITED", message: "请求过于频繁，请稍后重试。" }, requestId }, aiLimit.retryAfterMs, aiLimiter.windowMs);
      return;
    }
    try {
      if (request.method === "OPTIONS") {
        send( 204, {});
        return;
      }

      if (request.method === "GET" && pathname === "/api/live") {
        send(200, { ok: true });
        return;
      }

      if (request.method === "GET" && pathname === "/api/ready") {
        const config = productionConfig;
        const lifecycle = (server as AiServer).lifecycle;
        const ready = config.ok && stateStore.ready && !lifecycle?.isDraining() && !aiStateUnavailable;
        send(ready ? 200 : 503, { ok: ready, state: ready ? "ready" : "not_ready", persistenceMode: stateStore.mode, reasonCodes: ready ? [] : [...(config.ok ? [] : config.errors), ...(stateStore.ready ? [] : ["AI_STATE_NOT_READY"]), ...(aiStateUnavailable ? ["AI_STATE_UNAVAILABLE"] : []), ...(lifecycle?.isDraining() ? ["SERVER_DRAINING"] : [])] });
        return;
      }

      if (request.method === "GET" && pathname === "/api/health") {
        const runtime = agentRuntime as AgentRuntimeConfig;
        send( 200, {
          ok: true,
          provider: ai.provider,
          aiEnabled: ai.isConfigured,
          ai: {
            singleTurn: { configured: ai.isConfigured, model: aiConfig.model, provider: ai.provider },
            agent: {
              primary: { configured: Boolean(runtime.primary), model: runtime.primary?.model ?? null },
              fallback: { configured: Boolean(runtime.fallback), model: runtime.fallback?.model ?? null },
              localFallback: true,
              limits: { maxRounds: runtime.maxRounds, tokenBudget: runtime.tokenBudget },
              receiptPersistence: stateStore.mode,
              persistenceMode: stateStore.mode,
              persistenceReady: stateStore.ready,
              stateRecovered: stateStore.recovered,
            },
          },
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/workspace") {
        if (!hasApiToken(request, workspaceApiToken)) {
          requestApiAuth(request, response, corsOrigins, workspaceApiToken);
          return;
        }
        try {
          if (statSync(workspaceFile).size > maxWorkspaceBytes) {
            send( 413, { error: { code: "WORKSPACE_TOO_LARGE", message: "工作区快照超过大小限制" } });
            return;
          }
          const snapshot = JSON.parse(await readFile(workspaceFile, "utf8")) as unknown;
          if (!isWorkspaceSnapshot(snapshot)) throw new Error("工作区快照格式无效");
          send( 200, snapshot);
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            send( 404, { error: { code: "WORKSPACE_NOT_FOUND", message: "尚未保存工作区" } });
            return;
          }
          throw error;
        }
        return;
      }

      if (request.method === "PUT" && pathname === "/api/workspace") {
        if (!hasApiToken(request, workspaceApiToken)) {
          requestApiAuth(request, response, corsOrigins, workspaceApiToken);
          return;
        }
        const snapshot = await readJson(request, maxWorkspaceBytes);
        if (!isWorkspaceSnapshot(snapshot)) {
          send( 400, { error: { code: "VALIDATION_ERROR", message: "工作区快照格式无效" } });
          return;
        }
        await mkdir(dataDir, { recursive: true });
        const temporaryFile = `${workspaceFile}.${process.pid}.tmp`;
        await writeFile(temporaryFile, `${JSON.stringify(snapshot)}\n`, "utf8");
        await rename(temporaryFile, workspaceFile);
        response.writeHead(204, { ...securityHeaders(), ...corsHeaders(request, corsOrigins) });
        response.end();
        return;
      }

      const roomAccessToken = (request: http.IncomingMessage): string | null => {
        const value = request.headers["x-cengfan-room-token"];
        return typeof value === "string" && value.trim() ? value.trim() : null;
      };
      const roomErrorStatus = (error: CollaborationError): number => error.code === "VERSION_CONFLICT" || error.code === "ROOM_CLOSED" ? 409
        : error.code === "ROOM_NOT_FOUND" ? 404
          : error.code === "ROOM_LIMIT_REACHED" || error.code === "SUBSCRIBER_LIMIT_REACHED" ? 429
            : error.code === "ROOM_FORBIDDEN" || error.code === "FORBIDDEN" || error.code === "READONLY_ROOM" ? 403
              : error.code === "ROOM_INITIALIZING" ? 425
                : 400;
      // 只从路径取房间号做观测键，避免把请求体里的任何内容写进日志。
      const loggedRoomId = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{1,64})(?:\/|$)/)?.[1]?.toUpperCase();
      const sendRoomError = (error: CollaborationError) => {
        const status = roomErrorStatus(error);
        const body = { error: { code: error.code, message: error.message, currentVersion: error.currentVersion } };
        if (status === 429) {
          aiLogger.log("room.rate_limited", { roomId: loggedRoomId, errorCode: error.code });
          sendThrottled(status, body, undefined, DEFAULT_ROOM_RETRY_AFTER_MS);
          return;
        }
        if (error.code === "VERSION_CONFLICT") aiLogger.log("room.conflict", { roomId: loggedRoomId, errorCode: error.code });
        send(status, body);
      };
      const roomProjection = (room: ReturnType<typeof roomStore.get>, accessToken: string) => {
        if (!room) return null;
        const participant = roomStore.authorize(room.id, accessToken, "read");
        return { ...room, role: participant.role, participants: roomStore.listParticipants(room.id, accessToken) };
      };

      if (request.method === "POST" && pathname === "/api/rooms") {
        const roomLimit = roomCreateRateLimiter.check(clientIp(request, trustProxy));
        if (!roomLimit.allowed) {
          aiLogger.log("room.rate_limited", { errorCode: "ROOM_RATE_LIMITED" });
          sendThrottled(429, { error: { code: "ROOM_RATE_LIMITED", message: "创建房间过于频繁，请稍后重试。" } }, roomLimit.retryAfterMs, roomCreateRateLimiter.windowMs);
          return;
        }
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId || typeof body.displayName !== "string" || !body.displayName.trim()) {
          send( 400, { error: { code: "VALIDATION_ERROR", message: "clientId 和 displayName 必填" } });
          return;
        }
        try {
          const created = roomStore.create(body.snapshot, { clientId: body.clientId, displayName: body.displayName.trim() });
          aiLogger.log("room.created", { roomId: created.room.id, role: created.access.role });
          send(201, created);
        } catch (error) {
          if (error instanceof CollaborationError) {
            sendRoomError(error);
            return;
          }
          throw error;
        }
        return;
      }

      const roomMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
      if (request.method === "GET" && roomMatch) {
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        try {
          const room = roomProjection(roomStore.get(roomMatch[1]!), accessToken);
          if (!room) {
            send(404, { error: { code: "ROOM_NOT_FOUND", message: "共享房间不存在" } });
            return;
          }
          if (!room.ready) {
            send(425, { error: { code: "ROOM_INITIALIZING", message: "共享房间正在上传初始工程" } });
            return;
          }
          send(200, room);
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const invitationMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/invitations$/);
      if (request.method === "POST" && invitationMatch) {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        if (!isRecord(body) || (body.role !== "editor" && body.role !== "viewer")) {
          send(400, { error: { code: "VALIDATION_ERROR", message: "邀请角色无效" } });
          return;
        }
        try {
          send(201, roomStore.createInvitation(invitationMatch[1]!, accessToken, body.role));
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const joinMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/join$/);
      if (request.method === "POST" && joinMatch) {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        if (!isRecord(body) || typeof body.inviteToken !== "string" || typeof body.clientId !== "string" || typeof body.displayName !== "string") {
          send(400, { error: { code: "VALIDATION_ERROR", message: "邀请凭证、clientId 和 displayName 必填" } });
          return;
        }
        try {
          const joined = roomStore.join(joinMatch[1]!, { inviteToken: body.inviteToken, clientId: body.clientId, displayName: body.displayName });
          aiLogger.log("room.joined", { roomId: joined.room.id, role: joined.access.role });
          send(200, joined);
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const transactionMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/transactions$/);
      if (request.method === "POST" && transactionMatch) {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        if (!isRecord(body)) {
          send(400, { error: { code: "VALIDATION_ERROR", message: "请求体必须是对象" } });
          return;
        }
        try {
          const room = roomStore.apply(transactionMatch[1]!, accessToken, {
            txId: typeof body.txId === "string" ? body.txId : "",
            clientId: typeof body.clientId === "string" ? body.clientId : "",
            baseVersion: Number(body.baseVersion),
            snapshot: body.snapshot,
            operations: Array.isArray(body.operations) ? body.operations : undefined,
          });
          const prefer = Array.isArray(request.headers.prefer) ? request.headers.prefer.join(",") : request.headers.prefer ?? "";
          const result = prefer.toLowerCase().includes("return=minimal") ? { ...room, snapshot: undefined } : room;
          send(200, result);
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const memberMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/members$/);
      if (request.method === "POST" && memberMatch) {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId) {
          send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 必填" } });
          return;
        }
        try {
          send(200, roomStore.refreshMember(memberMatch[1]!, accessToken, body.clientId));
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const leaveMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/leave$/);
      if (request.method === "POST" && leaveMatch) {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId) {
          send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 必填" } });
          return;
        }
        try {
          // leave 自身第一步就是同样的 authorize，先取一次身份只为区分自离与踢人，不改变错误顺序。
          const actor = roomStore.authorize(leaveMatch[1]!, accessToken, "read");
          const result = roomStore.leave(leaveMatch[1]!, accessToken, body.clientId);
          if (body.clientId !== actor.id) aiLogger.log("room.kicked", { roomId: result.id, role: actor.role });
          send(200, result);
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const accessMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/access$/);
      if (request.method === "POST" && accessMatch) {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        if (!isRecord(body) || typeof body.clientId !== "string" || (body.action !== "set-readonly" && body.action !== "close")) {
          send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 与 action(set-readonly|close) 必填" } });
          return;
        }
        try {
          const result = roomStore.setAccess(accessMatch[1]!, accessToken, body.clientId, body.action);
          if (result.closed) aiLogger.log("room.closed", { roomId: result.id });
          send(200, result);
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const operationsMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/operations$/);
      if (request.method === "GET" && operationsMatch) {
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        const operationsUrl = new URL(url, "http://localhost");
        const afterVersionParam = operationsUrl.searchParams.get("afterVersion");
        const afterVersion = afterVersionParam === null ? Number.NaN : Number(afterVersionParam);
        if (afterVersionParam === null || !Number.isInteger(afterVersion) || afterVersion < 0) {
          send(400, { error: { code: "VALIDATION_ERROR", message: "afterVersion 必须是非负整数" } });
          return;
        }
        try {
          const result = roomStore.getOperations(operationsMatch[1]!, accessToken, afterVersion);
          send(200, {
            id: operationsMatch[1]!.toUpperCase(),
            version: result.version,
            afterVersion,
            operations: result.operations,
          });
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const eventsTicketMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/events-ticket$/);
      if (request.method === "POST" && eventsTicketMatch) {
        const accessToken = roomAccessToken(request);
        if (!accessToken) {
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
          return;
        }
        // 匿名成员可以无限狂铸 ticket 把全服 SSE 池挤爆，所以先按客户端 IP 限流，再按房间分池。
        const ticketLimit = roomTicketRateLimiter.check(clientIp(request, trustProxy));
        if (!ticketLimit.allowed) {
          aiLogger.log("room.rate_limited", { roomId: eventsTicketMatch[1]!.toUpperCase(), errorCode: "ROOM_RATE_LIMITED" });
          sendThrottled(429, { error: { code: "ROOM_RATE_LIMITED", message: "获取协作事件凭证过于频繁，请稍后重试。" } }, ticketLimit.retryAfterMs, roomTicketRateLimiter.windowMs);
          return;
        }
        try {
          const participant = roomStore.authorize(eventsTicketMatch[1]!, accessToken, "read");
          const ticket = randomBytes(24).toString("base64url");
          const expiresAt = Date.now() + roomEventsTicketTtlMs;
          if (!storeRoomEventsTicket(ticket, { roomId: eventsTicketMatch[1]!.toUpperCase(), accessToken, expiresAt })) {
            aiLogger.log("room.ticket_rejected", { roomId: eventsTicketMatch[1]!.toUpperCase(), role: participant.role, errorCode: "ROOM_LIMIT_REACHED" });
            sendThrottled(429, { error: { code: "ROOM_LIMIT_REACHED", message: "协作事件凭证过多，请稍后重试" } }, roomEventsTicketTtlMs, DEFAULT_ROOM_RETRY_AFTER_MS);
            return;
          }
          send(201, { ticket, expiresAt: new Date(expiresAt).toISOString() });
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
        }
        return;
      }

      const eventsMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/events$/);
      if (request.method === "GET" && eventsMatch) {
        const eventUrl = new URL(url, "http://localhost");
        const ticket = eventUrl.searchParams.get("ticket");
        const ticketRecord = ticket ? roomEventsTickets.get(ticket) : undefined;
        if (!ticketRecord || ticketRecord.roomId !== eventsMatch[1]!.toUpperCase() || ticketRecord.expiresAt <= Date.now()) {
          if (ticket) dropRoomEventsTicket(ticket);
          aiLogger.log("room.ticket_rejected", { roomId: eventsMatch[1]!.toUpperCase(), errorCode: "ROOM_FORBIDDEN" });
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "协作事件凭证无效或已过期" } });
          return;
        }
        dropRoomEventsTicket(ticket!);
        const knownVersionParam = eventUrl.searchParams.get("version");
        const knownVersion = knownVersionParam === null ? Number.NaN : Number(knownVersionParam);
        let unsubscribe: (() => void) | undefined;
        let unsubscribeLifecycle: (() => void) | undefined;
        let heartbeat: NodeJS.Timeout | undefined;
        // 断流必须同时退订并停心跳:留着监听器会在已 end 的响应上继续 write,
        // Node 会抛 ERR_STREAM_WRITE_AFTER_END。
        let streamEnded = false;
        const endStream = () => {
          if (streamEnded) return;
          streamEnded = true;
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
          unsubscribeLifecycle?.();
          response.end();
        };
        try {
          const room = roomStore.get(eventsMatch[1]!);
          if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
          const participant = roomStore.authorize(eventsMatch[1]!, ticketRecord.accessToken, "read");
          // 每次写出前复核读权限:凭证一旦被撤(踢人),这条连接立刻断掉,不再收到房间广播。
          const stillAuthorized = () => {
            try {
              roomStore.authorize(eventsMatch[1]!, ticketRecord.accessToken, "read");
              return true;
            } catch {
              return false;
            }
          };
          unsubscribe = roomStore.subscribe(eventsMatch[1]!, ticketRecord.accessToken, (next) => {
            if (streamEnded) return;
            if (!stillAuthorized()) {
              endStream();
              return;
            }
            const payload = next.operations || next.updatedBy === participant.id ? { ...next, snapshot: undefined } : next;
            response.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
          });
          unsubscribeLifecycle = roomStore.subscribeLifecycle(eventsMatch[1]!, ticketRecord.accessToken, (event) => {
            if (streamEnded) return;
            if (event.kind === "kicked") {
              if (event.clientId !== participant.id) {
                response.write(`event: members\ndata: ${JSON.stringify(event.members)}\n\n`);
                return;
              }
              response.write(`event: kicked\ndata: ${JSON.stringify({ id: event.room.id, version: event.room.version, clientId: event.clientId })}\n\n`);
              endStream();
              return;
            }
            if (event.kind === "closed") {
              response.write(`event: closed\ndata: ${JSON.stringify({ id: event.room.id, version: event.room.version, readonly: event.room.readonly === true, closed: true })}\n\n`);
              endStream();
              return;
            }
            if (event.kind === "access") {
              response.write(`event: snapshot\ndata: ${JSON.stringify({ ...event.room, snapshot: undefined })}\n\n`);
              return;
            }
            response.write(`event: members\ndata: ${JSON.stringify(event.members)}\n\n`);
          });
          response.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            ...corsHeaders(request, corsOrigins),
          });
          response.flushHeaders();
          if (!Number.isInteger(knownVersion) || knownVersion < room.version) {
            response.write(`event: snapshot\ndata: ${JSON.stringify(room)}\n\n`);
          }
        } catch (error) {
          // subscribe 成功后再抛错(例如 subscribeLifecycle 失败)会把监听器留在房间里，
          // 白占 maxSubscribers 名额，所以退订后再回错误。
          streamEnded = true;
          unsubscribe?.();
          unsubscribeLifecycle?.();
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
          return;
        }
        heartbeat = setInterval(() => {
          roomStore.get(eventsMatch[1]!);
          // 注释行心跳(": heartbeat")不会在 EventSource 上派发任何事件,客户端因此分不清
          // 「连接安静」与「TCP 半开已死」。发成真实事件,客户端看门狗才有活性信号可数。
          // 回滚:换回 response.write(": heartbeat\n\n")(同时要关掉客户端看门狗)。
          response.write("event: ping\ndata: {}\n\n");
        }, 20_000);
        request.on("close", () => {
          if (heartbeat) clearInterval(heartbeat);
          streamEnded = true;
          unsubscribe?.();
          unsubscribeLifecycle?.();
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/ai/agent") {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_AI_BODY_BYTES));
        const parsed = parseAgentRequest(body, { maxTokens: agentRuntime.tokenBudget, maxRounds: agentRuntime.maxRounds });
        if (!parsed.ok) {
          sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: parsed.error, aiCode: "AI_VALIDATION_ERROR" } });
          return;
        }
        const historyHasAssistantOrTool = parsed.value.messages.some((message) => message.role === "assistant" || message.role === "tool");
        const taskId = parsed.value.taskId || createAgentTaskId();
        const receiptClaim = parsed.value.budgetReceipt
          ? budgetReceiptLedger.beginConsume(parsed.value.budgetReceipt, taskId)
          : null;
        const initialClaim = parsed.value.budgetReceipt ? null : budgetReceiptLedger.reserveInitial(taskId);
        const claim = receiptClaim ?? initialClaim;
        const receipt = receiptClaim?.payload ?? null;
        // 带来的回执验不过：台账过了 TTL(默认 30 分钟)被清掉、并发抢占已消费、签名伪造、预算口径变了都算。
        // 这类失败与"请求体字段校验失败"性质不同——用户只能新开任务，所以单独给一个 error.code，
        // 客户端才能提示"会话预算已过期"而不是"内容未通过校验"。
        // 回滚：删掉 receiptRejected 分支，让它落回下面统一的 AI_VALIDATION_ERROR 即可。
        const receiptRejected = Boolean(parsed.value.budgetReceipt)
          && (!receiptClaim || receipt!.maxTokens !== agentRuntime.tokenBudget || receipt!.maxRounds !== agentRuntime.maxRounds);
        if (receiptRejected
          || (historyHasAssistantOrTool && !parsed.value.budgetReceipt)
          || (!parsed.value.budgetReceipt && !initialClaim)) {
          if (claim) budgetReceiptLedger.rollback(claim);
          if (receiptRejected) {
            sendAi(400, { error: { code: "AI_RECEIPT_EXPIRED", message: "会话预算回执已过期或已被使用，请新开一个 AI 任务" } });
            return;
          }
          sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: "会话预算回执无效、已过期或已被使用" } });
          return;
        }
        parsed.value.budget = receipt
          ? { usedTokens: receipt.usedTokens, maxTokens: receipt.maxTokens, rounds: receipt.rounds, maxRounds: receipt.maxRounds, lastPromptTokens: receipt.lastPromptTokens }
          : { usedTokens: 0, maxTokens: agentRuntime.tokenBudget, rounds: 0, maxRounds: agentRuntime.maxRounds };
        // 回执里带上 digest 指纹：续聊时指纹一致说明工程没变，本轮不必再把整包投影塞进 prompt。
        // 但服务端只看得到「本轮实际发来的那一层」：首轮 full、续聊 core，直接对 digest 取指纹会
        // 因为分层不同而永远对不上，续聊第一轮的去重必然落空。因此优先采用客户端另传的
        // digestFingerprint——它恒定基于 full 层，跨 full→core 仍能反映「工程有没有变」。
        // 该字段只影响本会话自己的 prompt（伪造它只会让自己拿到过期投影），故只做长度与字符集校验。
        // 回滚：把 digestHash 改回只取 digestFingerprint(parsed.value.digest) 即可；
        // 旧回执里的指纹自然对不上，行为退回「每轮全量 digest」，不会报错。
        const clientDigestFingerprint = isRecord(body) && typeof body.digestFingerprint === "string"
          && /^[A-Za-z0-9:._-]{1,128}$/.test(body.digestFingerprint)
          ? body.digestFingerprint
          : undefined;
        const digestHash = clientDigestFingerprint ?? digestFingerprint(parsed.value.digest);
        const digestUnchanged = Boolean(receipt && receipt.historyHash === digestHash);
        aiLogger.log("ai.request.started", { requestId, taskId, roundIndex: parsed.value.budget.rounds, route: "primary", messageCount: parsed.value.messages.length, promptBytes: Buffer.byteLength(parsed.value.userMessage, "utf8") });
        const requestController = new AbortController();
        const abortRequest = () => requestController.abort();
        const abortResponse = () => { if (!response.writableEnded) abortRequest(); };
        request.once("aborted", abortRequest);
        response.once("close", abortResponse);
        try {
          const outcome = await agent.runTurn({
            ...parsed.value,
            digestUnchanged,
            requestId,
            signal: requestController.signal,
            retryMaxAttempts: agentRuntime.retryMaxAttempts,
            retryBaseDelayMs: agentRuntime.retryBaseDelayMs,
          });
          const meta = "meta" in outcome ? outcome.meta : undefined;
          if (meta?.route === "fallback" || meta?.route === "local") {
            aiLogger.log("ai.route.fallback", {
              requestId,
              taskId,
              route: meta.route,
              provider: meta.provider,
              model: meta.model,
              latencyMs: meta.latencyMs,
              attempts: meta.attempts,
              usage: meta.usage,
              fallbackReason: meta.fallbackReason,
            });
          }
          const outcomeBudget = "budget" in outcome && outcome.budget ? outcome.budget : parsed.value.budget;
          const responseBudget = { usedTokens: outcomeBudget.usedTokens, maxTokens: outcomeBudget.maxTokens, rounds: outcomeBudget.rounds, maxRounds: outcomeBudget.maxRounds };
          aiLogger.log("ai.agent.finished", { requestId, taskId, roundIndex: responseBudget.rounds, route: meta?.route, provider: meta?.provider, model: meta?.model, latencyMs: meta?.latencyMs, attempts: meta?.attempts, usage: meta?.usage, budgetUsedTokens: responseBudget.usedTokens, toolNames: agentToolNames(outcome), fallbackReason: meta?.fallbackReason });
          aiLogger.log("ai.request.completed", { requestId, taskId, route: meta?.route, provider: meta?.provider, model: meta?.model, latencyMs: meta?.latencyMs, attempts: meta?.attempts, usage: meta?.usage });
          const budgetReceipt = budgetReceipts.issue({ taskId, ...responseBudget, sequence: (receipt?.sequence ?? 0) + 1, issuedAt: Date.now(), historyHash: digestHash, lastPromptTokens: outcomeBudget.lastPromptTokens });
          const budgetPayload = budgetReceipts.verify(budgetReceipt, taskId);
          if (!budgetPayload || !claim) throw new Error("预算回执签发失败");
          let committed = false;
          const commitReceipt = () => {
            if (committed) return;
            committed = budgetReceiptLedger.commit(claim, budgetReceipt, budgetPayload);
            if (!committed) budgetReceiptLedger.rollback(claim);
          };
          const rollbackReceipt = () => {
            if (!committed) budgetReceiptLedger.rollback(claim);
          };
          response.once("finish", commitReceipt);
          response.once("close", rollbackReceipt);
          sendAi(200, { ...outcome, provider: meta?.provider ?? agent.provider, taskId, budget: responseBudget, budgetReceipt });
        } catch (error) {
          if (claim) budgetReceiptLedger.rollback(claim);
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "AI_UPSTREAM_UNAVAILABLE";
          aiLogger.log(code === "AI_ABORTED" ? "ai.agent.cancelled" : "ai.request.failed", { requestId, taskId, errorCode: code });
          if (!response.destroyed) sendAi(code === "AI_ABORTED" ? 499 : 502, { error: { code, message: code === "AI_ABORTED" ? "AI 调用已取消" : "AI 服务暂时不可用" } });
        } finally {
          request.removeListener("aborted", abortRequest);
          response.removeListener("close", abortResponse);
        }
        return;
      }

      if (request.method === "POST" && pathname === "/api/ai/parse-data") {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_AI_BODY_BYTES));
        aiLogger.log("ai.request.started", { requestId });
        const parsed = parseDataRequestSchema(body);
        if (!parsed.ok || !parsed.value) {
          sendAi(400, {
            error: { code: "AI_VALIDATION_ERROR", message: parsed.error },
          });
          return;
        }
        const requestController = new AbortController();
        const abortRequest = () => requestController.abort();
        const abortResponse = () => { if (!response.writableEnded) abortRequest(); };
        request.once("aborted", abortRequest);
        response.once("close", abortResponse);
        try {
          const result = await ai.parseData(parsed.value, { requestId, signal: requestController.signal });
          if (result.provider === "local-fallback") aiLogger.log("ai.route.fallback", { requestId, route: "local", provider: result.provider, model: "local-rules", fallbackReason: "remote_failure" });
          aiLogger.log("ai.request.completed", { requestId, route: result.provider === "local-fallback" ? "local" : "primary", provider: result.provider });
          sendAi(200, result);
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "AI_UPSTREAM_UNAVAILABLE";
          aiLogger.log(code === "AI_ABORTED" ? "ai.agent.cancelled" : "ai.request.failed", { requestId, errorCode: code });
          if (!response.destroyed) sendAi(code === "AI_ABORTED" ? 499 : 502, { error: { code, message: code === "AI_ABORTED" ? "AI 调用已取消" : "AI 服务暂时不可用" } });
        } finally {
          request.removeListener("aborted", abortRequest);
          response.removeListener("close", abortResponse);
        }
        return;
      }

      // 破坏性变更：/api/ai/propose-edits 与 /api/ai/explain 已随前端单轮建议入口一同下线，
      // 现在与其他未知 AI 路径一样落到下面的 404 分支。回滚办法：revert 本切片对应提交即可恢复
      // 这两个路由及其 schema / local-fallback 实现。
      if (url.startsWith("/api/")) {
        send( 404, {
          error: { code: "NOT_FOUND", message: "接口不存在" },
        });
        return;
      }

      if (request.method === "GET" && staticDir) {
        if (serveStatic(request, response, staticDir, url, corsOrigins)) {
          return;
        }
      }

      send( 404, {
        error: { code: "NOT_FOUND", message: "资源不存在" },
      });
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        (aiPath ? sendAi : send)(413, { error: { code: "REQUEST_TOO_LARGE", message: "请求体超过大小限制" } });
        return;
      }
      if (error instanceof InvalidJsonError) {
        (aiPath ? sendAi : send)(400, { error: { code: aiPath ? "AI_VALIDATION_ERROR" : "INVALID_JSON", message: error.message } });
        return;
      }
      (aiPath ? sendAi : send)(500, {
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "未知错误",
        },
      });
    }
  });
  Object.defineProperty(server, "flushAiState", { value: flushAiState });
  return server as AiServer;
}

export async function createReadyAiServer(options: AiServerOptions = {}): Promise<AiServer> {
  const config = options.productionConfig ?? validateProductionConfig(process.env);
  if (!config.ok) throw new Error(`生产配置无效: ${config.errors.join(",")}`);
  const dataDir = resolve(options.dataDir ?? config.config?.dataDir ?? process.env.DATA_DIR ?? DEFAULT_DATA_DIR);
  const stateFile = process.env.AI_STATE_FILE ?? config.config?.aiStateFile ?? join(dataDir, "ai-runtime-state.json");
  const store = options.aiStateStore ?? createFileAiStateStore(stateFile);
  const state = await store.load();
  return createAiServer({ ...options, aiStateStore: store, aiRuntimeState: state, productionConfig: config });
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  normalize(process.argv[1]).includes(`${normalize("server")}${normalize("/")}index`);

if (isDirectRun) {
  // 加载项目根目录的 .env（若存在），使 AI_API_KEY 等配置生效。
  const envFile = resolve(".env");
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch (error) {
      console.warn("Failed to load .env", error);
    }
  }
  const staticDir =
    process.env.STATIC_DIR ||
    (existsSync(resolve("dist/index.html")) ? resolve("dist") : undefined);
  const productionConfig = validateProductionConfig(process.env);
  if (!productionConfig.ok) {
    console.error(`生产配置无效: ${productionConfig.errors.join(",")}`);
    process.exitCode = 1;
  }
  const serverPromise = createReadyAiServer({ staticDir, aiConfig: resolveAiConfig(), productionConfig });
  void serverPromise.then((server) => {
    const lifecycle = createServerLifecycle({ server, flush: () => server.flushAiState?.() ?? Promise.resolve(), timeoutMs: productionConfig.config?.shutdownTimeoutMs, onDraining: () => undefined });
    Object.defineProperty(server, "lifecycle", { value: lifecycle });
    const shutdown = (signal: string) => void lifecycle.shutdown(signal).then(() => process.exit(0));
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    const port = resolvePort();
    server.listen(port, "0.0.0.0", () => {
      console.log(
        `Cengfan studio listening on http://0.0.0.0:${port}${staticDir ? ` (static: ${staticDir})` : ""}`,
      );
      console.log(`AI provider: ${resolveAgentConfig().model || "local-fallback"}`);
    });
  }).catch((error) => {
    console.error("Failed to initialize AI runtime state", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
