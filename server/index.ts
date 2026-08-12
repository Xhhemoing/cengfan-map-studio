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
import { createRateLimiter } from "./ai/rate-limit";
import { createAiLogger } from "./ai/ai-observability";
import {
  parseDataRequestSchema,
  proposeEditsRequestSchema,
} from "./ai/schemas";
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

function clientIp(request: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstIp = value?.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return (request.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
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
  };
  aiLogger?: ReturnType<typeof createAiLogger>;
  maxJsonBodyBytes?: number;
  maxWorkspaceBytes?: number;
  maxRooms?: number;
  maxRoomSubscribers?: number;
  roomTtlMs?: number;
  roomInvitationTtlMs?: number;
  roomEventsTicketTtlMs?: number;
  trustProxy?: boolean;
  budgetReceiptSecret?: string;
  budgetReceiptLedger?: BudgetReceiptLedger;
  aiStateStore?: AiStateStore;
  aiRuntimeState?: AiRuntimeState;
  rateLimitOptions?: {
    agent?: { limit: number; windowMs: number; maxEntries?: number };
    otherAi?: { limit: number; windowMs: number; maxEntries?: number };
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
  const MAX_ROOM_EVENTS_TICKETS = 10_000;
  const evictExpiredTickets = () => {
    const now = Date.now();
    for (const [ticket, record] of roomEventsTickets) {
      if (record.expiresAt <= now) roomEventsTickets.delete(ticket);
    }
  };
  const storeRoomEventsTicket = (ticket: string, record: { roomId: string; accessToken: string; expiresAt: number }) => {
    if (roomEventsTickets.size >= MAX_ROOM_EVENTS_TICKETS) {
      evictExpiredTickets();
      if (roomEventsTickets.size >= MAX_ROOM_EVENTS_TICKETS) {
        // 拒绝新 ticket，防止内存被恶意请求撑满。
        return false;
      }
    }
    roomEventsTickets.set(ticket, record);
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
      sendAi(429, { error: { code: "AI_RATE_LIMITED", message: "请求过于频繁，请稍后重试。" } });
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
      const sendRoomError = (error: CollaborationError) => send(roomErrorStatus(error), {
        error: { code: error.code, message: error.message, currentVersion: error.currentVersion },
      });
      const roomProjection = (room: ReturnType<typeof roomStore.get>, accessToken: string) => {
        if (!room) return null;
        const participant = roomStore.authorize(room.id, accessToken, "read");
        return { ...room, role: participant.role, participants: roomStore.listParticipants(room.id, accessToken) };
      };

      if (request.method === "POST" && pathname === "/api/rooms") {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES));
        if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId || typeof body.displayName !== "string" || !body.displayName.trim()) {
          send( 400, { error: { code: "VALIDATION_ERROR", message: "clientId 和 displayName 必填" } });
          return;
        }
        try {
          send(201, roomStore.create(body.snapshot, { clientId: body.clientId, displayName: body.displayName.trim() }));
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
          send(200, roomStore.join(joinMatch[1]!, { inviteToken: body.inviteToken, clientId: body.clientId, displayName: body.displayName }));
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
          send(200, roomStore.leave(leaveMatch[1]!, accessToken, body.clientId));
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
          send(200, roomStore.setAccess(accessMatch[1]!, accessToken, body.clientId, body.action));
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
        try {
          roomStore.authorize(eventsTicketMatch[1]!, accessToken, "read");
          const ticket = randomBytes(24).toString("base64url");
          const expiresAt = Date.now() + roomEventsTicketTtlMs;
          if (!storeRoomEventsTicket(ticket, { roomId: eventsTicketMatch[1]!.toUpperCase(), accessToken, expiresAt })) {
            send(429, { error: { code: "ROOM_LIMIT_REACHED", message: "协作事件凭证过多，请稍后重试" } });
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
          if (ticket) roomEventsTickets.delete(ticket);
          send(403, { error: { code: "ROOM_FORBIDDEN", message: "协作事件凭证无效或已过期" } });
          return;
        }
        roomEventsTickets.delete(ticket!);
        const knownVersionParam = eventUrl.searchParams.get("version");
        const knownVersion = knownVersionParam === null ? Number.NaN : Number(knownVersionParam);
        let unsubscribe: () => void;
        let unsubscribeLifecycle: () => void;
        try {
          const room = roomStore.get(eventsMatch[1]!);
          if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
          const participant = roomStore.authorize(eventsMatch[1]!, ticketRecord.accessToken, "read");
          unsubscribe = roomStore.subscribe(eventsMatch[1]!, ticketRecord.accessToken, (next) => {
            const payload = next.operations || next.updatedBy === participant.id ? { ...next, snapshot: undefined } : next;
            response.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
          });
          unsubscribeLifecycle = roomStore.subscribeLifecycle(eventsMatch[1]!, ticketRecord.accessToken, (event) => {
            if (event.kind === "closed") {
              response.write(`event: closed\ndata: ${JSON.stringify({ id: event.room.id, version: event.room.version, readonly: event.room.readonly === true, closed: true })}\n\n`);
              response.end();
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
          if (error instanceof CollaborationError) sendRoomError(error);
          else throw error;
          return;
        }
        const heartbeat = setInterval(() => {
          roomStore.get(eventsMatch[1]!);
          response.write(": heartbeat\n\n");
        }, 20_000);
        request.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
          unsubscribeLifecycle();
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
        if ((historyHasAssistantOrTool && !parsed.value.budgetReceipt)
          || (parsed.value.budgetReceipt && (!receiptClaim || receipt!.maxTokens !== agentRuntime.tokenBudget || receipt!.maxRounds !== agentRuntime.maxRounds))
          || (!parsed.value.budgetReceipt && !initialClaim)) {
          if (claim) budgetReceiptLedger.rollback(claim);
          sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: "会话预算回执无效、已过期或已被使用" } });
          return;
        }
        parsed.value.budget = receipt
          ? { usedTokens: receipt.usedTokens, maxTokens: receipt.maxTokens, rounds: receipt.rounds, maxRounds: receipt.maxRounds }
          : { usedTokens: 0, maxTokens: agentRuntime.tokenBudget, rounds: 0, maxRounds: agentRuntime.maxRounds };
        aiLogger.log("ai.request.started", { requestId, route: "primary", messageCount: parsed.value.messages.length, promptBytes: Buffer.byteLength(parsed.value.userMessage, "utf8") });
        const requestController = new AbortController();
        const abortRequest = () => requestController.abort();
        const abortResponse = () => { if (!response.writableEnded) abortRequest(); };
        request.once("aborted", abortRequest);
        response.once("close", abortResponse);
        try {
          const outcome = await agent.runTurn({
            ...parsed.value,
            requestId,
            signal: requestController.signal,
            retryMaxAttempts: agentRuntime.retryMaxAttempts,
            retryBaseDelayMs: agentRuntime.retryBaseDelayMs,
          });
          const meta = "meta" in outcome ? outcome.meta : undefined;
          if (meta?.route === "fallback" || meta?.route === "local") {
            aiLogger.log("ai.route.fallback", {
              requestId,
              route: meta.route,
              provider: meta.provider,
              model: meta.model,
              latencyMs: meta.latencyMs,
              attempts: meta.attempts,
              usage: meta.usage,
              fallbackReason: meta.fallbackReason,
            });
          }
          aiLogger.log("ai.agent.finished", { requestId, route: meta?.route, provider: meta?.provider, model: meta?.model, latencyMs: meta?.latencyMs, attempts: meta?.attempts, usage: meta?.usage, fallbackReason: meta?.fallbackReason });
          aiLogger.log("ai.request.completed", { requestId, route: meta?.route, provider: meta?.provider, model: meta?.model, latencyMs: meta?.latencyMs, attempts: meta?.attempts, usage: meta?.usage });
          const responseBudget = "budget" in outcome && outcome.budget ? outcome.budget : parsed.value.budget;
          const budgetReceipt = budgetReceipts.issue({ taskId, usedTokens: responseBudget.usedTokens, rounds: responseBudget.rounds, maxTokens: responseBudget.maxTokens, maxRounds: responseBudget.maxRounds, sequence: (receipt?.sequence ?? 0) + 1, issuedAt: Date.now() });
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
          aiLogger.log(code === "AI_ABORTED" ? "ai.agent.cancelled" : "ai.request.failed", { requestId, errorCode: code });
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

      if (request.method === "POST" && pathname === "/api/ai/propose-edits") {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_AI_BODY_BYTES));
        aiLogger.log("ai.request.started", { requestId });
        const parsed = proposeEditsRequestSchema(body);
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
          const result = await ai.proposeEdits(parsed.value, { requestId, signal: requestController.signal });
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

      if (request.method === "POST" && pathname === "/api/ai/explain") {
        const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_AI_BODY_BYTES));
        aiLogger.log("ai.request.started", { requestId });
        if (!isRecord(body) || typeof body.message !== "string" || !body.message.trim()) {
          sendAi(400, {
            error: { code: "AI_VALIDATION_ERROR", message: "message 不能为空" },
          });
          return;
        }
        const requestController = new AbortController();
        const abortRequest = () => requestController.abort();
        const abortResponse = () => { if (!response.writableEnded) abortRequest(); };
        request.once("aborted", abortRequest);
        response.once("close", abortResponse);
        try {
          const result = await ai.explain(body.message, Number(body.studentCount ?? 0), { requestId, signal: requestController.signal });
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
