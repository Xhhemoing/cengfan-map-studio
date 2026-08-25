import type http from "node:http";

import { parseAgentRequest } from "./ai/agent-request";
import type { AgentLoopBackend, AgentRuntimeConfig } from "./ai/agent-routing";
import type { createAiLogger } from "./ai/ai-observability";
import type { BudgetReceiptLedger, BudgetReceiptSigner } from "./ai/budget-receipt";
import type { AiBackend } from "./ai/llm-client";
import {
  parseDataRequestSchema,
  proposeEditsRequestSchema,
} from "./ai/schemas";

/** 单个 AI 请求体的上限；与全局 JSON 上限取较小值。 */
const DEFAULT_MAX_AI_BODY_BYTES = 512 * 1024;

function createAgentTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * AI 路由需要的全部外部依赖。这些值在 `createAiServer` 里构造一次，与单次请求无关，
 * 请求相关的部分走 {@link AiRouteContext}。
 *
 * 限流器与生产环境的 token 门禁**不在**这里：它们在 `server/index.ts` 里对整个
 * `/api/ai/` 前缀生效（含未命中的路径），搬进来会让 `POST /api/ai/unknown` 不再计数。
 */
export interface AiRoutesDeps {
  ai: AiBackend;
  agent: AgentLoopBackend;
  agentRuntime: AgentRuntimeConfig;
  budgetReceipts: BudgetReceiptSigner;
  budgetReceiptLedger: BudgetReceiptLedger;
  aiLogger: ReturnType<typeof createAiLogger>;
  readJson: (request: http.IncomingMessage, maxBytes: number) => Promise<unknown>;
  maxJsonBodyBytes: number;
  isRecord: (value: unknown) => value is Record<string, unknown>;
}

/** 单次请求的接线面：路由只通过它读请求、发响应。 */
export interface AiRouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  pathname: string;
  /** 已归一的请求 id；`sendAi` 已经把它拼进响应体，日志字段仍要显式带上。 */
  requestId: string;
  sendAi: (status: number, body: unknown) => void;
}

/**
 * 四条 AI HTTP 路由。`handle` 命中时自行发完响应并返回 true，未命中返回 false
 * 交回调用方继续匹配（`/api/ai/` 下的未知路径仍由 index.ts 归一成 404）。
 *
 * 读体失败沿用原有抛出语义：`readJson` 的体积/JSON 错误一律向外抛，由 index.ts 的
 * 统一 catch 按 aiPath 归一成 413/400/500。
 */
export function createAiRoutes(deps: AiRoutesDeps) {
  const { ai, agent, agentRuntime, budgetReceipts, budgetReceiptLedger, aiLogger, readJson, isRecord } = deps;
  const maxAiBodyBytes = Math.min(deps.maxJsonBodyBytes, DEFAULT_MAX_AI_BODY_BYTES);

  const handle = async (context: AiRouteContext): Promise<boolean> => {
    const { request, response, pathname, requestId, sendAi } = context;

    if (request.method === "POST" && pathname === "/api/ai/agent") {
      const body = await readJson(request, maxAiBodyBytes);
      const parsed = parseAgentRequest(body, { maxTokens: agentRuntime.tokenBudget, maxRounds: agentRuntime.maxRounds });
      if (!parsed.ok) {
        sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: parsed.error, aiCode: "AI_VALIDATION_ERROR" } });
        return true;
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
        return true;
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
      return true;
    }

    if (request.method === "POST" && pathname === "/api/ai/parse-data") {
      const body = await readJson(request, maxAiBodyBytes);
      aiLogger.log("ai.request.started", { requestId });
      const parsed = parseDataRequestSchema(body);
      if (!parsed.ok || !parsed.value) {
        sendAi(400, {
          error: { code: "AI_VALIDATION_ERROR", message: parsed.error },
        });
        return true;
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
      return true;
    }

    if (request.method === "POST" && pathname === "/api/ai/propose-edits") {
      const body = await readJson(request, maxAiBodyBytes);
      aiLogger.log("ai.request.started", { requestId });
      const parsed = proposeEditsRequestSchema(body);
      if (!parsed.ok || !parsed.value) {
        sendAi(400, {
          error: { code: "AI_VALIDATION_ERROR", message: parsed.error },
        });
        return true;
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
      return true;
    }

    if (request.method === "POST" && pathname === "/api/ai/explain") {
      const body = await readJson(request, maxAiBodyBytes);
      aiLogger.log("ai.request.started", { requestId });
      if (!isRecord(body) || typeof body.message !== "string" || !body.message.trim()) {
        sendAi(400, {
          error: { code: "AI_VALIDATION_ERROR", message: "message 不能为空" },
        });
        return true;
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
      return true;
    }

    return false;
  };

  return { handle };
}
