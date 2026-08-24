import type { ImportCandidate, UnparsedLine } from "../../src/lib/import-data";
import type { ParseDataRequest, SourceType } from "./schemas";
import { localParseData } from "./local-fallback";
import type { AiCallMeta, AiRoute, ChatMessage, ToolDefinition } from "./agent-types";
import { AiCallError } from "./ai-errors";
import { requestChatCompletion } from "./ai-transport";

export const PROVIDER_NAME = "tokenfree";
export const DEFAULT_AI_BASE_URL = "https://tokenfreevip.cc.cd/v1";
export const DEFAULT_AI_MODEL = "deepseek-v4-flash";
const DEFAULT_AI_TIMEOUT_MS = 60_000;
const DEFAULT_AI_MAX_TOKENS = 4000;

export interface AiConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  /** Agent 备选模型（tokenfree/luna）使用的独立密钥。 */
  fallbackApiKey?: string;
  fallbackBaseUrl?: string;
  retryMaxAttempts?: number;
  retryBaseDelayMs?: number;
}

export function resolveAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const baseUrl = (env.AI_BASE_URL || "").trim() || DEFAULT_AI_BASE_URL;
  const apiKey = (env.AI_API_KEY || env.TOKENFREE_API_KEY || "").trim() || undefined;
  const model = (env.AI_MODEL || "").trim() || DEFAULT_AI_MODEL;
  const timeoutMs = Number(env.AI_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS);
  const maxTokens = Number(env.AI_MAX_TOKENS || DEFAULT_AI_MAX_TOKENS);
  return {
    apiKey,
    baseUrl,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_AI_TIMEOUT_MS,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : DEFAULT_AI_MAX_TOKENS,
    fallbackApiKey: (env.AI_FALLBACK_API_KEY || env.TOKENFREE_API_KEY || "").trim() || undefined,
    fallbackBaseUrl: (env.AI_FALLBACK_BASE_URL || "").trim() || undefined,
  };
}

export interface ParseDataResult {
  provider: string;
  source: SourceType;
  candidates: ImportCandidate[];
  unparsed: UnparsedLine[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 调用 OpenAI 兼容的原生工具调用接口。
 * 与 chatJson 分开，保留 assistant 的 tool_calls 与 reasoning_content，供下一轮继续对话。
 */
export interface AiRequestContext {
  requestId?: string;
  route?: AiRoute;
  signal?: AbortSignal;
}

function transportConfig(config: AiConfig) {
  return {
    apiKey: config.apiKey!,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxAttempts: config.retryMaxAttempts ?? 1,
    retryBaseDelayMs: config.retryBaseDelayMs ?? 0,
  };
}

export async function chatWithTools(
  config: AiConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  maxTokens?: number,
  context: AiRequestContext = {},
): Promise<ChatMessage & { meta?: AiCallMeta }> {
  if (!config.apiKey) throw new Error("未配置 AI API Key");
  const result = await requestChatCompletion({
    config: transportConfig(config),
    requestId: context.requestId ?? "ai-request",
    route: context.route ?? "primary",
    signal: context.signal,
    body: { messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: maxTokens ?? Math.max(config.maxTokens, 4000) },
    parse: (payload) => {
      const message = (payload as { choices: Array<{ message?: ChatMessage }> }).choices[0]?.message;
      if (!message) throw new AiCallError("AI_INVALID_RESPONSE", "LLM 未返回 assistant 消息");
      return message;
    },
  });
  return { ...result.value, meta: result.meta };
}

/**
 * 从 LLM 回复中提取第一个完整的 JSON 对象。
 * 兼容 ```json 代码块、前后附带散文等常见情况。
 */
export function extractJsonObject(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("LLM 输出中没有找到 JSON 对象");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index++) {
    const char = trimmed[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(trimmed.slice(start, index + 1));
    }
  }
  throw new Error("LLM 输出的 JSON 不完整");
}

const JSON_ONLY_SYSTEM =
  "你是一个严格的 JSON 输出引擎。只输出合法 JSON，禁止输出 JSON 之外的任何文字、代码块标记或解释。你的整个回复必须能被 JSON.parse 直接解析。";

async function chatJson(config: AiConfig, system: string, user: string, maxTokens?: number, context: AiRequestContext = {}): Promise<unknown> {
  if (!config.apiKey) throw new Error("未配置 AI API Key");
  const result = await requestChatCompletion({
    config: transportConfig(config),
    requestId: context.requestId ?? "ai-request",
    route: context.route ?? "primary",
    signal: context.signal,
    body: { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, max_tokens: maxTokens ?? config.maxTokens },
    parse: (payload) => {
      const content = (payload as { choices: Array<{ message?: { content?: string } }> }).choices[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new AiCallError("AI_INVALID_RESPONSE", "LLM 未返回内容");
      return extractJsonObject(content);
    },
  });
  return result.value;
}

/** 与前端 import-data 的 splitLines 保持一致的行切分，保证行号对应。 */
function splitLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function parseDataWithLlm(config: AiConfig, request: ParseDataRequest, context: AiRequestContext = {}) {
  const lines = splitLines(request.text);
  if (lines.length === 0) throw new Error("没有可解析的数据行");
  const numbered = lines.map((line, index) => `第 ${index + 1} 行：${line}`).join("\n");
  const userPrompt = `以下是学生去向数据的每一行（行号已标注，来源类型：${request.source}）：\n\n${numbered}\n\n请解析每一行，提取：姓名/学生名称、录取院校、所在城市。\n只输出 JSON，格式：\n{"candidates":[{"lineIndex":1,"name":"姓名","university":"院校","city":"城市"}],"unparsed":[{"lineIndex":2,"reason":"无法识别原因"}]}\n要求：\n1. lineIndex 必须引用上面标注的行号。\n2. 无法提取出完整三要素（姓名、院校、城市）的行放入 unparsed 并给出中文原因。\n3. 保持真实数据，不要编造；一行只能对应一条记录。`;

  const data = await chatJson(config, JSON_ONLY_SYSTEM, userPrompt, 3000, context);
  if (!isRecord(data)) throw new Error("LLM 解析结果不是对象");
  const candidates: ImportCandidate[] = [];
  const unparsed: UnparsedLine[] = [];
  const rawCandidates = Array.isArray(data.candidates) ? data.candidates : [];
  const rawUnparsed = Array.isArray(data.unparsed) ? data.unparsed : [];
  for (const raw of rawCandidates) {
    if (!isRecord(raw)) continue;
    const lineIndex = Number(raw.lineIndex);
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const university = typeof raw.university === "string" ? raw.university.trim() : "";
    const city = typeof raw.city === "string" ? raw.city.trim() : "";
    if (!Number.isInteger(lineIndex) || lineIndex < 1 || lineIndex > lines.length) continue;
    if (!name || !university || !city) continue;
    candidates.push({ name, university, city, sourceLine: lineIndex, rawLine: lines[lineIndex - 1]! });
  }
  for (const raw of rawUnparsed) {
    if (!isRecord(raw)) continue;
    const lineIndex = Number(raw.lineIndex);
    const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : "无法识别";
    if (!Number.isInteger(lineIndex) || lineIndex < 1 || lineIndex > lines.length) continue;
    unparsed.push({ sourceLine: lineIndex, rawLine: lines[lineIndex - 1]!, reason });
  }
  if (candidates.length === 0 && unparsed.length === 0) throw new Error("LLM 未返回有效解析结果");
  return { candidates, unparsed };
}

export interface AiBackend {
  provider: string;
  isConfigured: boolean;
  parseData(request: ParseDataRequest, context?: AiRequestContext): Promise<ParseDataResult>;
}

/**
 * 创建 AI 后端：配置了 AI_API_KEY 时调用 tokenfree（OpenAI 兼容）接口，
 * 任何调用失败或未配置时自动回退到本地确定性规则（local-fallback）。
 */
export function createAiBackend(config: AiConfig = resolveAiConfig()): AiBackend {
  const configured = Boolean(config.apiKey);
  const fallbackReason = (kind: string, error: unknown) => {
    console.warn(`[ai] ${kind} 调用失败，已回退本地规则：`, error instanceof Error ? error.message : String(error));
  };
  return {
    provider: configured ? PROVIDER_NAME : "local-fallback",
    isConfigured: configured,
    async parseData(request, context = {}) {
      // 本地确定性规则先解析全文，只有它解不动的行才值得花 token。
      const local = localParseData(request);
      if (!configured || local.unparsed.length === 0) return local;
      const pending = local.unparsed;
      try {
        const llm = await parseDataWithLlm(config, { ...request, text: pending.map((line) => line.rawLine).join("\n") }, context);
        const toSourceLine = (lineIndex: number) => pending[lineIndex - 1]?.sourceLine ?? lineIndex;
        const candidates = [
          ...local.candidates,
          ...llm.candidates.map((candidate) => ({ ...candidate, sourceLine: toSourceLine(candidate.sourceLine) })),
        ].sort((left, right) => left.sourceLine - right.sourceLine);
        return {
          provider: PROVIDER_NAME,
          source: request.source,
          candidates,
          unparsed: llm.unparsed.map((line) => ({ ...line, sourceLine: toSourceLine(line.sourceLine) })),
        };
      } catch (error) {
        if (error instanceof AiCallError && error.code === "AI_ABORTED") throw error;
        fallbackReason("parse-data", error);
        return local;
      }
    },
  };
}

