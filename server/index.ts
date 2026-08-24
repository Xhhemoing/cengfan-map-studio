import http from "node:http";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createBudgetReceiptLedger, createBudgetReceiptSigner, type BudgetReceiptLedger } from "./ai/budget-receipt";
import { createFileAiStateStore, createMemoryAiStateStore, emptyAiRuntimeState, type AiRuntimeState, type AiStateStore } from "./ai/ai-state-store";
import { createAiRouter } from "./ai-routes";
import { createServerLifecycle, validateProductionConfig } from "./production";
import { join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAiBackend,
  resolveAiConfig,
  type AiBackend,
  type AiConfig,
} from "./ai/llm-client";
import { createAgentLoopBackend, normalizeAgentRuntimeConfig, resolveAgentConfig, resolveAgentRuntimeConfig, type AgentRuntimeConfig } from "./ai/agent-routing";
import { createRateLimiter } from "./ai/rate-limit";
import { createAiLogger } from "./ai/ai-observability";
import { createRoomStore } from "./collaboration";
import { createCollaborationRouter } from "./collaboration-routes";
import { clientIp } from "./client-ip";
import { isHostAllowed } from "./host-validation";
import { handleRequestMethod } from "./route-methods";
import {
  HTTP_ERROR_CODES,
  RequestBodyError,
  apiSecurityHeaders,
  corsHeaders,
  createJsonSender,
  isRecord,
  positiveByteLimit,
  readJson,
  requestIdFor,
} from "./http-utils";
import { serveStatic } from "./static-files";
import { hasApiToken, requestApiAuth } from "./workspace-auth";

export const DEFAULT_PORT = 8787;
export type AiServer = http.Server & { flushAiState?: () => Promise<void>; lifecycle?: ReturnType<typeof createServerLifecycle> };

export function resolvePort(value: string | undefined = process.env.PORT): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_PORT;
}
const DEFAULT_DATA_DIR = fileURLToPath(new URL("../.data", import.meta.url));

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
  };
  aiLogger?: ReturnType<typeof createAiLogger>;
  maxJsonBodyBytes?: number;
  maxWorkspaceBytes?: number;
  maxRooms?: number;
  maxRoomSubscribers?: number;
  roomTtlMs?: number;
  roomInvitationTtlMs?: number;
  roomEventsTicketTtlMs?: number;
  roomEventsHeartbeatMs?: number;
  trustProxy?: boolean;
  budgetReceiptSecret?: string;
  budgetReceiptLedger?: BudgetReceiptLedger;
  aiStateStore?: AiStateStore;
  aiRuntimeState?: AiRuntimeState;
  rateLimitOptions?: {
    agent?: { limit: number; windowMs: number; maxEntries?: number };
    otherAi?: { limit: number; windowMs: number; maxEntries?: number };
    rooms?: { limit: number; windowMs: number; maxEntries?: number };
  };
  onAiStateUnavailable?: () => void;
  productionConfig?: ReturnType<typeof validateProductionConfig>;
}

const DEFAULT_MAX_JSON_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ROOMS = 100;
const DEFAULT_MAX_ROOM_SUBSCRIBERS = 50;
const DEFAULT_ROOM_TTL_MS = 30 * 60 * 1000;
const DEFAULT_ROOM_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ROOM_EVENTS_TICKET_TTL_MS = 60 * 1000;

function isWorkspaceSnapshot(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const record = value as Record<string, unknown>;
  return record.kind === "cengfan-workspace"
    && record.version === 1
    && Boolean(record.projectPackage)
    && typeof record.projectPackage === "object"
    && !Array.isArray(record.projectPackage);
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
  const aiLogger = options.aiLogger ?? createAiLogger();
  const maxJsonBodyBytes = positiveByteLimit(options.maxJsonBodyBytes, DEFAULT_MAX_JSON_BODY_BYTES);
  const maxWorkspaceBytes = positiveByteLimit(options.maxWorkspaceBytes ?? Number(process.env.MAX_WORKSPACE_BYTES), DEFAULT_MAX_WORKSPACE_BYTES);
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === "1";
  const workspaceFile = join(dataDir, "workspace.json");
  const roomStore = createRoomStore({
    maxRooms: options.maxRooms ?? Number(process.env.MAX_ROOMS ?? DEFAULT_MAX_ROOMS),
    maxSubscribers: options.maxRoomSubscribers ?? Number(process.env.MAX_ROOM_SUBSCRIBERS ?? DEFAULT_MAX_ROOM_SUBSCRIBERS),
    maxSnapshotBytes: Math.min(maxJsonBodyBytes, 8 * 1024 * 1024),
    roomTtlMs: options.roomTtlMs ?? Number(process.env.ROOM_TTL_MS ?? DEFAULT_ROOM_TTL_MS),
    invitationTtlMs: options.roomInvitationTtlMs ?? DEFAULT_ROOM_INVITATION_TTL_MS,
  });
  const roomEventsTicketTtlMs = options.roomEventsTicketTtlMs ?? DEFAULT_ROOM_EVENTS_TICKET_TTL_MS;
  const collaborationRouter = createCollaborationRouter({
    roomStore,
    roomCreateRateLimiter,
    clientIp: (request) => clientIp(request, trustProxy),
    maxJsonBodyBytes,
    roomEventsTicketTtlMs,
    roomEventsHeartbeatMs: options.roomEventsHeartbeatMs,
    corsOrigins,
  });
  const aiRouter = createAiRouter({
    ai,
    agent,
    agentRuntime,
    aiLogger,
    budgetReceipts,
    budgetReceiptLedger,
    maxJsonBodyBytes,
  });
  const flushAiState = async () => {
    try {
      await stateStore.flush();
    } catch (error) {
      aiStateUnavailable = true;
      throw error;
    }
  };

  const server = http.createServer({ maxHeaderSize: 16 * 1024, requireHostHeader: true }, async (request, response) => {
    const url = request.url || "/";
    const pathname = new URL(url, "http://localhost").pathname;
    const requestId = requestIdFor(request);
    const send = createJsonSender(request, response, corsOrigins, requestId);
    if (!isHostAllowed(request, server)) return send(421, { error: { code: "MISDIRECTED_REQUEST", message: "Host 请求头不受信任" } });
    const sendAi = (status: number, body: unknown) => send(status, { ...(isRecord(body) ? body : {}), requestId });
    if (handleRequestMethod(request, response, pathname, Boolean(staticDir), send)) return;
    const aiPath = pathname.startsWith("/api/ai/");
    const aiRequiresToken = productionConfig.config?.nodeEnv === "production"
      && !productionConfig.config?.aiPublicAccess
      && Boolean(workspaceApiToken);
    if (aiPath && request.method === "POST" && aiRequiresToken && !hasApiToken(request, workspaceApiToken)) {
      requestApiAuth(request, response, corsOrigins, workspaceApiToken, requestId);
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
          requestApiAuth(request, response, corsOrigins, workspaceApiToken, requestId);
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
          requestApiAuth(request, response, corsOrigins, workspaceApiToken, requestId);
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
        response.writeHead(204, { ...apiSecurityHeaders(), ...corsHeaders(request, corsOrigins) });
        response.end();
        return;
      }

      if (await collaborationRouter({ request, response, pathname, url, send })) return;

      if (await aiRouter({ request, response, pathname, requestId, sendAi })) return;

      if (pathname.startsWith("/api/")) {
        send( 404, {
          error: { code: "NOT_FOUND", message: "接口不存在" },
        });
        return;
      }

      if (request.method === "GET" && staticDir) {
        if (serveStatic(request, response, staticDir, url, corsOrigins, requestId)) {
          return;
        }
      }

      send( 404, {
        error: { code: "NOT_FOUND", message: "资源不存在" },
      });
    } catch (error) {
      if (error instanceof RequestBodyError) {
        const code = aiPath && error.code === HTTP_ERROR_CODES.invalidJson ? "AI_VALIDATION_ERROR" : error.code;
        (aiPath ? sendAi : send)(error.status, { error: { code, message: error.message } });
        return;
      }
      (aiPath ? sendAi : send)(500, {
        error: {
          code: HTTP_ERROR_CODES.internal,
          message: "服务器内部错误",
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
