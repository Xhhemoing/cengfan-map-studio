import { AiCallError } from "./ai-errors";
import { isRecord } from "./agent-types";
import { READ_ONLY_TOOLS } from "./tool-registry";
import type { TaskStep } from "./task-plan";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_TOKEN_RESERVE = 2048;
export interface JevConfig { apiKey: string; model: string; timeoutMs: number; minConfidence: number; }
export interface StepDecision { stepId: string; source: "jev" | "deterministic"; reason: string; chargedTokens: number; }
export function resolveJevConfig(env: NodeJS.ProcessEnv = process.env): JevConfig | undefined {
  if (env.AI_DECISION_PROVIDER !== "jev" || !env.JEV_API_KEY?.trim()) return undefined;
  const timeout = Number(env.JEV_TIMEOUT_MS ?? 1500);
  const confidence = Number(env.JEV_MIN_CONFIDENCE ?? 0.85);
  const model = env.JEV_MODEL?.trim() || "jev-latest";
  return {
    apiKey: env.JEV_API_KEY.trim(),
    model: /^[a-zA-Z0-9._-]{1,100}$/.test(model) ? model : "jev-latest",
    timeoutMs: Number.isFinite(timeout) ? Math.min(5000, Math.max(100, timeout)) : 1500,
    minConfidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.85,
  };
}
export function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AiCallError("AI_ABORTED", "AI 调用已取消");
}

/** Only code-owned metadata leaves this boundary: no instruction, titles, IDs, arguments or roster. */
export async function chooseReadyStep(steps: TaskStep[], config?: JevConfig, signal?: AbortSignal): Promise<StepDecision> {
  checkCancellation(signal);
  if (!steps.length) throw new Error("没有就绪步骤");
  const local = (reason: string, chargedTokens = 0): StepDecision => ({ stepId: steps[0]!.id, source: "deterministic", reason, chargedTokens });
  if (!config || steps.length === 1) return local(!config ? "disabled" : "single-candidate");
  const choices = Object.fromEntries(steps.map((step, index) => [`option_${index}`, { tool: step.tool, readOnly: READ_ONLY_TOOLS.has(step.tool), dependencyCount: step.dependsOn.length }]));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (reason: Error) => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); rejectAbort(new AiCallError("AI_ABORTED", "AI 调用已取消")); };
  signal?.addEventListener("abort", abort, { once: true });
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, config.timeoutMs);
  });
  const attempt = (async () => {
    const response = await fetch(JEV_ENDPOINT, {
      method: "POST", signal: controller.signal, redirect: "error",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, state: { readyCount: steps.length }, questions: { next_step: {
        type: "choice", instructions: "Choose one already validated ready step; prefer read-only inspection before a preview edit. You cannot grant approval.", criteria: choices,
      } } }),
    });
    if (!response.ok) throw new Error("upstream-unavailable");
    return await response.json() as unknown;
  })();
  try {
    const payload = await Promise.race([attempt, deadline, cancelled]);
    checkCancellation(signal);
    if (!isRecord(payload) || !isRecord(payload.answers) || !isRecord(payload.answers.next_step)) return local("invalid-response", JEV_TOKEN_RESERVE);
    const answer = payload.answers.next_step;
    const probabilities = answer.probabilities;
    if (answer.type !== "choice" || typeof answer.choice !== "string" || !Object.hasOwn(choices, answer.choice) || typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence) || answer.confidence < config.minConfidence || answer.confidence > 1 || !isRecord(probabilities)) return local("invalid-or-low-confidence", JEV_TOKEN_RESERVE);
    const keys = Object.keys(choices);
    const values = Object.values(probabilities);
    if (Object.keys(probabilities).length !== keys.length || keys.some((key) => !Object.hasOwn(probabilities, key)) || values.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) return local("invalid-probabilities", JEV_TOKEN_RESERVE);
    const numbers = values as number[];
    if (Math.abs(numbers.reduce((a, b) => a + b, 0) - 1) > 0.01 || Number(probabilities[answer.choice]) < Math.max(...numbers)) return local("invalid-probabilities", JEV_TOKEN_RESERVE);
    const index = keys.indexOf(answer.choice);
    return { stepId: steps[index]!.id, source: "jev", reason: "validated-choice", chargedTokens: JEV_TOKEN_RESERVE };
  } catch (error) {
    checkCancellation(signal);
    return local(error instanceof Error && error.message === "timeout" ? "timeout" : "unavailable", JEV_TOKEN_RESERVE);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    // The race installs rejection handlers on all branches, including abort-ignoring transports.
  }
}
