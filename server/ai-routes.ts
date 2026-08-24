import type http from "node:http";
import type { createBudgetReceiptLedger, createBudgetReceiptSigner } from "./ai/budget-receipt";
import { parseAgentRequest } from "./ai/agent-request";
import type { createAgentLoopBackend, AgentRuntimeConfig } from "./ai/agent-routing";
import type { createAiLogger } from "./ai/ai-observability";
import type { AiBackend } from "./ai/llm-client";
import { parseDataRequestSchema, proposeEditsRequestSchema } from "./ai/schemas";
import { isRecord, readJson } from "./http-utils";

const DEFAULT_MAX_AI_BODY_BYTES = 512 * 1024;

interface AiRouterOptions {
  ai: AiBackend;
  agent: ReturnType<typeof createAgentLoopBackend>;
  agentRuntime: AgentRuntimeConfig;
  aiLogger: ReturnType<typeof createAiLogger>;
  budgetReceipts: ReturnType<typeof createBudgetReceiptSigner>;
  budgetReceiptLedger: ReturnType<typeof createBudgetReceiptLedger>;
  maxJsonBodyBytes: number;
}

interface AiRouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  pathname: string;
  requestId: string;
  sendAi: (status: number, body: unknown) => void;
}

function createAgentTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function upstreamCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "AI_UPSTREAM_UNAVAILABLE";
}

export function createAiRouter(options: AiRouterOptions) {
  const maxBodyBytes = Math.min(options.maxJsonBodyBytes, DEFAULT_MAX_AI_BODY_BYTES);
  return async ({ request, response, pathname, requestId, sendAi }: AiRouteContext): Promise<boolean> => {
    if (request.method === "POST" && pathname === "/api/ai/agent") {
      const body = await readJson(request, maxBodyBytes);
      const parsed = parseAgentRequest(body, {
        maxTokens: options.agentRuntime.tokenBudget,
        maxRounds: options.agentRuntime.maxRounds,
      });
      if (!parsed.ok) {
        sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: parsed.error, aiCode: "AI_VALIDATION_ERROR" } });
        return true;
      }
      const historyHasAssistantOrTool = parsed.value.messages.some((message) => message.role === "assistant" || message.role === "tool");
      const taskId = parsed.value.taskId || createAgentTaskId();
      const receiptClaim = parsed.value.budgetReceipt
        ? options.budgetReceiptLedger.beginConsume(parsed.value.budgetReceipt, taskId)
        : null;
      const initialClaim = parsed.value.budgetReceipt ? null : options.budgetReceiptLedger.reserveInitial(taskId);
      const claim = receiptClaim ?? initialClaim;
      const receipt = receiptClaim?.payload ?? null;
      if ((historyHasAssistantOrTool && !parsed.value.budgetReceipt)
        || (parsed.value.budgetReceipt && (!receiptClaim || receipt!.maxTokens !== options.agentRuntime.tokenBudget || receipt!.maxRounds !== options.agentRuntime.maxRounds))
        || (!parsed.value.budgetReceipt && !initialClaim)) {
        if (claim) options.budgetReceiptLedger.rollback(claim);
        sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: "会话预算回执无效、已过期或已被使用" } });
        return true;
      }
      parsed.value.budget = receipt
        ? { usedTokens: receipt.usedTokens, maxTokens: receipt.maxTokens, rounds: receipt.rounds, maxRounds: receipt.maxRounds }
        : { usedTokens: 0, maxTokens: options.agentRuntime.tokenBudget, rounds: 0, maxRounds: options.agentRuntime.maxRounds };
      options.aiLogger.log("ai.request.started", { requestId, route: "primary", messageCount: parsed.value.messages.length, promptBytes: Buffer.byteLength(parsed.value.userMessage, "utf8") });
      const requestController = new AbortController();
      const abortRequest = () => requestController.abort();
      const abortResponse = () => { if (!response.writableEnded) abortRequest(); };
      request.once("aborted", abortRequest);
      response.once("close", abortResponse);
      try {
        const outcome = await options.agent.runTurn({
          ...parsed.value,
          requestId,
          signal: requestController.signal,
          retryMaxAttempts: options.agentRuntime.retryMaxAttempts,
          retryBaseDelayMs: options.agentRuntime.retryBaseDelayMs,
        });
        const meta = "meta" in outcome ? outcome.meta : undefined;
        if (meta?.route === "fallback" || meta?.route === "local") {
          options.aiLogger.log("ai.route.fallback", {
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
        options.aiLogger.log("ai.agent.finished", { requestId, route: meta?.route, provider: meta?.provider, model: meta?.model, latencyMs: meta?.latencyMs, attempts: meta?.attempts, usage: meta?.usage, fallbackReason: meta?.fallbackReason });
        options.aiLogger.log("ai.request.completed", { requestId, route: meta?.route, provider: meta?.provider, model: meta?.model, latencyMs: meta?.latencyMs, attempts: meta?.attempts, usage: meta?.usage });
        const responseBudget = "budget" in outcome && outcome.budget ? outcome.budget : parsed.value.budget;
        const budgetReceipt = options.budgetReceipts.issue({
          taskId,
          usedTokens: responseBudget.usedTokens,
          rounds: responseBudget.rounds,
          maxTokens: responseBudget.maxTokens,
          maxRounds: responseBudget.maxRounds,
          sequence: (receipt?.sequence ?? 0) + 1,
          issuedAt: Date.now(),
        });
        const budgetPayload = options.budgetReceipts.verify(budgetReceipt, taskId);
        if (!budgetPayload || !claim) throw new Error("预算回执签发失败");
        let committed = false;
        const commitReceipt = () => {
          if (committed) return;
          committed = options.budgetReceiptLedger.commit(claim, budgetReceipt, budgetPayload);
          if (!committed) options.budgetReceiptLedger.rollback(claim);
        };
        const rollbackReceipt = () => {
          if (!committed) options.budgetReceiptLedger.rollback(claim);
        };
        response.once("finish", commitReceipt);
        response.once("close", rollbackReceipt);
        sendAi(200, { ...outcome, provider: meta?.provider ?? options.agent.provider, taskId, budget: responseBudget, budgetReceipt });
      } catch (error) {
        if (claim) options.budgetReceiptLedger.rollback(claim);
        const code = upstreamCode(error);
        options.aiLogger.log(code === "AI_ABORTED" ? "ai.agent.cancelled" : "ai.request.failed", { requestId, errorCode: code });
        if (!response.destroyed) sendAi(code === "AI_ABORTED" ? 499 : 502, { error: { code, message: code === "AI_ABORTED" ? "AI 调用已取消" : "AI 服务暂时不可用" } });
      } finally {
        request.removeListener("aborted", abortRequest);
        response.removeListener("close", abortResponse);
      }
      return true;
    }

    const runLegacyRoute = async <T extends { provider: string }>(
      execute: (signal: AbortSignal) => Promise<T>,
    ): Promise<void> => {
      const requestController = new AbortController();
      const abortRequest = () => requestController.abort();
      const abortResponse = () => { if (!response.writableEnded) abortRequest(); };
      request.once("aborted", abortRequest);
      response.once("close", abortResponse);
      try {
        const result = await execute(requestController.signal);
        if (result.provider === "local-fallback") {
          options.aiLogger.log("ai.route.fallback", { requestId, route: "local", provider: result.provider, model: "local-rules", fallbackReason: "remote_failure" });
        }
        options.aiLogger.log("ai.request.completed", { requestId, route: result.provider === "local-fallback" ? "local" : "primary", provider: result.provider });
        sendAi(200, result);
      } catch (error) {
        const code = upstreamCode(error);
        options.aiLogger.log(code === "AI_ABORTED" ? "ai.agent.cancelled" : "ai.request.failed", { requestId, errorCode: code });
        if (!response.destroyed) sendAi(code === "AI_ABORTED" ? 499 : 502, { error: { code, message: code === "AI_ABORTED" ? "AI 调用已取消" : "AI 服务暂时不可用" } });
      } finally {
        request.removeListener("aborted", abortRequest);
        response.removeListener("close", abortResponse);
      }
    };

    if (request.method === "POST" && pathname === "/api/ai/parse-data") {
      const body = await readJson(request, maxBodyBytes);
      options.aiLogger.log("ai.request.started", { requestId });
      const parsed = parseDataRequestSchema(body);
      if (!parsed.ok || !parsed.value) {
        sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: parsed.error } });
      } else {
        await runLegacyRoute((signal) => options.ai.parseData(parsed.value!, { requestId, signal }));
      }
      return true;
    }

    if (request.method === "POST" && pathname === "/api/ai/propose-edits") {
      const body = await readJson(request, maxBodyBytes);
      options.aiLogger.log("ai.request.started", { requestId });
      const parsed = proposeEditsRequestSchema(body);
      if (!parsed.ok || !parsed.value) {
        sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: parsed.error } });
      } else {
        await runLegacyRoute((signal) => options.ai.proposeEdits(parsed.value!, { requestId, signal }));
      }
      return true;
    }

    if (request.method === "POST" && pathname === "/api/ai/explain") {
      const body = await readJson(request, maxBodyBytes);
      options.aiLogger.log("ai.request.started", { requestId });
      if (!isRecord(body) || typeof body.message !== "string" || !body.message.trim()) {
        sendAi(400, { error: { code: "AI_VALIDATION_ERROR", message: "message 不能为空" } });
      } else {
        await runLegacyRoute((signal) => options.ai.explain(body.message as string, Number(body.studentCount ?? 0), { requestId, signal }));
      }
      return true;
    }

    return false;
  };
}
