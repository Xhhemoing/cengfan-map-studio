import type { StudioAsset } from "./assets";
import { createId } from "./ids";
import { classifyAgentCall, highestRisk, type AgentToolCall, type RiskLevel } from "./agent-risk";
import { buildProjectDigest } from "./project-digest";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { compactAgentToolResult, compactConversationMessages } from "./agent-session-compaction";
import { MAX_ROUNDS, textOnlyConversation, validateAgentSessionSnapshot, type AgentSessionSnapshot } from "./agent-session-snapshot";
import { cloneProject, executeAgentToolCall, READ_ONLY_TOOLS, type AgentStep } from "./agent-session-tools";

export { compactAgentToolResult } from "./agent-session-compaction";
export { validateAgentSessionSnapshot } from "./agent-session-snapshot";
export type { AgentSessionMetrics, AgentSessionReplayStep, AgentSessionSnapshot } from "./agent-session-snapshot";
export type { AgentStep, AgentToolResult } from "./agent-session-tools";

const CLIENT_ROUND_TIMEOUT_MS = 70_000;

export interface AgentSessionOptions {
  mode: "conservative" | "smart";
  assets?: StudioAsset[];
  endpoint?: string;
  onProgress?: (progress: { round: number; name: string; status: "running" | "done" | "rejected" }) => void;
}

interface AgentApiOutcome {
  kind: "tool-call" | "tool-rejected" | "finish" | "failed";
  calls?: AgentToolCall[];
  assistantMessage?: Record<string, unknown>;
  summary?: string;
  error?: string;
  meta?: { requestId?: string; provider?: string; model?: string; route?: "primary" | "fallback" | "local"; latencyMs?: number; attempts?: number; usage?: { totalTokens?: number }; fallbackReason?: string };
  budget?: { usedTokens: number; maxTokens: number; rounds: number; maxRounds: number };
}

export class AgentSession {
  private shadow: ProjectDocument;
  private readonly options: AgentSessionOptions;
  private readonly conversation: Array<Record<string, unknown>> = [];
  private _steps: AgentStep[] = [];
  private activeController: AbortController | null = null;
  private activeRun: Promise<{ kind: "finish" | "tool-rejected" | "failed" | "cancelled"; summary?: string; error?: string }> | null = null;
  private completed = false;
  private budget = { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: 20 };
  private taskId: string | undefined;
  private budgetReceipt: string | undefined;
  private _metrics = { rounds: 0, usedTokens: 0, route: undefined as "primary" | "fallback" | "local" | undefined, provider: undefined as string | undefined, fallbackReason: undefined as string | undefined };

  constructor(project: ProjectDocument, options: AgentSessionOptions) {
    this.shadow = cloneProject(project);
    this.options = options;
  }

  static restore(project: ProjectDocument, snapshot: AgentSessionSnapshot, options: AgentSessionOptions): AgentSession {
    validateAgentSessionSnapshot(snapshot);
    const session = new AgentSession(project, options);
    session.conversation.push(...structuredClone(snapshot.conversation));
    for (const replayStep of snapshot.steps) {
      const executed = executeAgentToolCall(session.shadow, { id: replayStep.id, name: replayStep.name, arguments: structuredClone(replayStep.arguments) }, options.assets);
      if (!executed.result.ok) throw new Error("Agent 会话步骤无法在当前项目上重放");
      session.shadow = executed.project;
      session._steps.push({ ...structuredClone(replayStep), result: executed.result });
    }
    session._metrics = structuredClone(snapshot.metrics);
    session.completed = snapshot.completed;
    return session;
  }

  static restoreTextHistory(project: ProjectDocument, snapshot: AgentSessionSnapshot, options: AgentSessionOptions): AgentSession {
    validateAgentSessionSnapshot(snapshot);
    const session = new AgentSession(project, options);
    session.conversation.push(...structuredClone(snapshot.conversation));
    session._metrics = structuredClone(snapshot.metrics);
    session.completed = true;
    return session;
  }

  exportSnapshot(): AgentSessionSnapshot {
    const snapshot: AgentSessionSnapshot = {
      schemaVersion: 2,
      conversation: textOnlyConversation(this.conversation),
      steps: this._steps
        .filter((step) => !READ_ONLY_TOOLS.has(step.name) && step.result.ok)
        .map(({ id, name, arguments: args, risk, lostManualLayout }) => ({ id, name, arguments: structuredClone(args), risk, lostManualLayout })),
      metrics: structuredClone(this._metrics),
      completed: this.completed,
    };
    validateAgentSessionSnapshot(snapshot);
    return structuredClone(snapshot);
  }

  get shadowProject(): ProjectDocument {
    return this.shadow;
  }

  get steps(): AgentStep[] {
    return [...this._steps];
  }

  get metrics() {
    return { ...this._metrics };
  }

  get canContinue(): boolean {
    return this.completed && !this.activeRun;
  }

  cancel(): void {
    this.activeController?.abort();
  }

  async run(message: string, options: { signal?: AbortSignal; continue?: boolean } = {}): Promise<{ kind: "finish" | "tool-rejected" | "failed" | "cancelled"; summary?: string; error?: string }> {
    if (this.activeRun) throw new Error("Agent 会话正在进行中");
    if (options.signal?.aborted) return { kind: "cancelled" };
    if (!options.continue) {
      this.conversation.length = 0;
      this.completed = false;
      this.budget = { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: 20 };
      this.taskId = undefined;
      this.budgetReceipt = undefined;
    }
    this.conversation.push({ role: "user", content: message });
    const controller = new AbortController();
    this.activeController = controller;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const work = (async () => {
      try {
        for (let round = 0; round < MAX_ROUNDS; round += 1) {
          if (controller.signal.aborted) return { kind: "cancelled" as const };
          compactConversationMessages(this.conversation);
          const roundController = new AbortController();
          let timedOut = false;
          const abortRound = () => roundController.abort();
          controller.signal.addEventListener("abort", abortRound, { once: true });
          const timeout = setTimeout(() => {
            timedOut = true;
            roundController.abort();
          }, CLIENT_ROUND_TIMEOUT_MS);
          let response: Response;
          try {
            response = await fetch(this.options.endpoint ?? "/api/ai/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userMessage: message, digest: buildProjectDigest(this.shadow), messages: this.conversation, budget: this.budget, taskId: this.taskId, budgetReceipt: this.budgetReceipt }),
              signal: roundController.signal,
            });
          } catch (cause) {
            if (timedOut) return { kind: "failed" as const, error: "AI 请求超时，请稍后重试。" };
            throw cause;
          } finally {
            clearTimeout(timeout);
            controller.signal.removeEventListener("abort", abortRound);
          }
          if (!response.ok) {
            const data = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
            const code = data?.error?.code;
            const messageByCode: Record<string, string> = {
              AI_RATE_LIMITED: "请求过于频繁，请稍后重试。",
              AI_VALIDATION_ERROR: "请求内容未通过校验，请重新开始当前 AI 任务。",
              AI_UPSTREAM_UNAVAILABLE: "AI 服务暂时不可用，请稍后重试。",
              AI_TIMEOUT: "AI 请求超时，请稍后重试。",
            };
            return { kind: "failed" as const, error: messageByCode[code ?? ""] ?? data?.error?.message ?? `Agent 接口错误：${response.status}` };
          }
          const outcome = await response.json() as AgentApiOutcome & { taskId?: string; budgetReceipt?: string };
          this.taskId = outcome.taskId ?? this.taskId;
          this.budgetReceipt = outcome.budgetReceipt ?? this.budgetReceipt;
          if (outcome.meta) {
            this._metrics = { ...this._metrics, rounds: this._metrics.rounds + 1, usedTokens: this._metrics.usedTokens + (outcome.meta.usage?.totalTokens ?? 0), route: outcome.meta.route, provider: outcome.meta.provider ?? outcome.meta.model, fallbackReason: outcome.meta.fallbackReason };
          }
          if (outcome.budget) this.budget = outcome.budget;
          if (outcome.kind === "failed") return { kind: "failed" as const, error: outcome.error ?? "Agent 失败" };
          if (outcome.kind === "finish") { this.completed = true; return { kind: "finish" as const, summary: outcome.summary ?? "已完成。" }; }
          if (outcome.kind === "tool-rejected") {
            const assistantToolCalls = Array.isArray(outcome.assistantMessage?.tool_calls) ? outcome.assistantMessage.tool_calls as Array<{ id?: unknown }> : [];
            if (assistantToolCalls.length > 0) {
              this.conversation.push(outcome.assistantMessage!);
              for (const toolCall of assistantToolCalls) {
                if (typeof toolCall.id === "string" && toolCall.id) this.conversation.push({ role: "tool", tool_call_id: toolCall.id, content: outcome.error ?? "工具参数被拒绝" });
              }
            } else {
              this.conversation.push({ role: "assistant", content: outcome.assistantMessage?.content ?? "模型工具调用未通过校验。" });
              this.conversation.push({ role: "user", content: "请不要调用无效工具；请根据上一条拒绝原因重新规划，并只使用合法工具或直接用中文总结。" });
            }
            continue;
          }
          if (outcome.assistantMessage) this.conversation.push(outcome.assistantMessage);
          for (const call of outcome.calls ?? []) {
            const risk = classifyAgentCall(this.shadow, call);
            this.options.onProgress?.({ round: round + 1, name: call.name, status: "running" });
            const executed = executeAgentToolCall(this.shadow, call, this.options.assets);
            this.shadow = executed.project;
            const toolResult = { ...executed.result, content: compactAgentToolResult(call.name, executed.result.content) };
            let lostManualLayout = false;
            try { lostManualLayout = call.name === "auto_layout" && Boolean(JSON.parse(toolResult.content).lostManualLayout); } catch { /* result is already represented as a tool error */ }
            this._steps.push({ id: call.id, name: call.name, arguments: call.arguments, result: toolResult, risk: lostManualLayout ? "high" : risk.level, lostManualLayout });
            this.options.onProgress?.({ round: round + 1, name: call.name, status: toolResult.ok ? "done" : "rejected" });
            this.conversation.push({ role: "tool", tool_call_id: call.id, content: toolResult.content });
          }
        }
        this.completed = true;
        return { kind: "finish" as const, summary: "已达到 20 轮上限，已交付当前完成的修改。" };
      } catch (cause) {
        if (controller.signal.aborted || cause instanceof DOMException && cause.name === "AbortError") return { kind: "cancelled" as const };
        return { kind: "failed" as const, error: cause instanceof Error ? cause.message : "AI 会话失败" };
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
        this.activeController = null;
      }
    })();
    this.activeRun = work;
    try { return await work; } finally { this.activeRun = null; }
  }

  continue(message: string, options: { signal?: AbortSignal } = {}) {
    if (!this.canContinue) return Promise.reject(new Error("当前会话不能继续"));
    return this.run(message, { ...options, continue: true });
  }

  landingPreview(): { steps: AgentStep[]; needsConfirmation: boolean; highestRisk: RiskLevel } {
    const steps = this._steps.filter((step) => !READ_ONLY_TOOLS.has(step.name));
    const level = highestRisk(steps.map((step) => ({ level: step.risk, reason: "" })));
    return { steps, needsConfirmation: this.options.mode === "conservative" || level === "high", highestRisk: level };
  }

  transactionForSteps(stepIds: ReadonlySet<string>): ProjectTransaction | null {
    const selectedSteps = this._steps.filter((step) =>
      stepIds.has(step.id) && !READ_ONLY_TOOLS.has(step.name) && step.result.ok,
    );
    if (selectedSteps.length === 0) return null;

    return {
      id: createId("tx-ai-agent"),
      label: `AI 助手：${selectedSteps.length} 项改动`,
      source: "ai",
      apply: (current) => {
        let replayShadow = cloneProject(current);
        for (const step of selectedSteps) {
          replayShadow = executeAgentToolCall(replayShadow, { id: step.id, name: step.name, arguments: structuredClone(step.arguments) }, this.options.assets).project;
        }
        const finalSnapshot = cloneProject(replayShadow);
        return { ...finalSnapshot, history: current.history, version: current.version };
      },
    };
  }

  transaction(): ProjectTransaction {
    const stepIds = new Set(this._steps.filter((step) => !READ_ONLY_TOOLS.has(step.name)).map((step) => step.id));
    return this.transactionForSteps(stepIds) ?? {
      id: createId("tx-ai-agent"),
      label: "AI 助手：0 项改动",
      source: "ai",
      apply: (current) => current,
    };
  }
}
