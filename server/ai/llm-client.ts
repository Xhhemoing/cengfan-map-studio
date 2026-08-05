import type { ImportCandidate, UnparsedLine } from "../../src/lib/import-data";
import {
  validateEditorCommandPayload,
  type EditorCommandPayload,
  type ParseDataRequest,
  type ProposeEditsRequest,
  type SourceType,
} from "./schemas";
import {
  localExplain,
  localParseData,
  localProposeEdits,
} from "./local-fallback";
import type { ChatMessage, ToolDefinition } from "./agent-types";

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

export interface ProposalResult {
  provider: string;
  mode: "proposal" | "explain";
  explanation: string;
  commands: EditorCommandPayload[];
}

export interface ExplainResult {
  provider: string;
  mode: "explain";
  explanation: string;
  commands: EditorCommandPayload[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 调用 OpenAI 兼容的原生工具调用接口。
 * 与 chatJson 分开，保留 assistant 的 tool_calls 与 reasoning_content，供下一轮继续对话。
 */
export async function chatWithTools(
  config: AiConfig,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  maxTokens?: number,
): Promise<ChatMessage> {
  if (!config.apiKey) throw new Error("未配置 AI API Key");
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: maxTokens ?? Math.max(config.maxTokens, 4000),
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM API ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: ChatMessage }>;
  };
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("LLM 未返回 assistant 消息");
  return message;
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

async function chatJson(config: AiConfig, system: string, user: string, maxTokens?: number): Promise<unknown> {
  if (!config.apiKey) throw new Error("未配置 AI API Key");
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: maxTokens ?? config.maxTokens,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM API ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("LLM 未返回内容");
  return extractJsonObject(content);
}

/** 与前端 import-data 的 splitLines 保持一致的行切分，保证行号对应。 */
function splitLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function parseDataWithLlm(config: AiConfig, request: ParseDataRequest) {
  const lines = splitLines(request.text);
  if (lines.length === 0) throw new Error("没有可解析的数据行");
  const numbered = lines.map((line, index) => `第 ${index + 1} 行：${line}`).join("\n");
  const userPrompt = `以下是学生去向数据的每一行（行号已标注，来源类型：${request.source}）：\n\n${numbered}\n\n请解析每一行，提取：姓名/学生名称、录取院校、所在城市。\n只输出 JSON，格式：\n{"candidates":[{"lineIndex":1,"name":"姓名","university":"院校","city":"城市"}],"unparsed":[{"lineIndex":2,"reason":"无法识别原因"}]}\n要求：\n1. lineIndex 必须引用上面标注的行号。\n2. 无法提取出完整三要素（姓名、院校、城市）的行放入 unparsed 并给出中文原因。\n3. 保持真实数据，不要编造；一行只能对应一条记录。`;

  const data = await chatJson(config, JSON_ONLY_SYSTEM, userPrompt, 3000);
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

const PROPOSE_SYSTEM =
  `${JSON_ONLY_SYSTEM}\n\n` +
  "你是“蹭饭图”（中国学生去向海报编辑器）的 AI 助手。用户会用中文自然语言描述对海报的修改需求，你负责把它们转成白名单编辑器命令；如果用户只是在提问，则用 explain 模式回答。";

const COMMAND_VALUES = {
  dataView: ["province", "pins", "heat", "city", "university"],
  template: ["original", "cartoon", "grain", "q", "scenery", "regional"],
  cardPreset: ["standard", "compact", "ticket", "photo"],
} as const;

async function proposeEditsWithLlm(config: AiConfig, request: ProposeEditsRequest) {
  const summary = request.projectSummary;
  const userPrompt =
    `当前项目状态：\n` +
    `{"studentCount":${summary.studentCount},"templateId":"${summary.templateId}","dataView":"${summary.dataView}","cardPreset":"${summary.cardPreset}"}\n\n` +
    `用户需求：${request.message}\n\n` +
    `可用的命令类型白名单：\n` +
    `- setDataView：切换分组视图，after 取值 ${JSON.stringify(COMMAND_VALUES.dataView)}\n` +
    `- setTemplate：切换地图模板，after 取值 ${JSON.stringify(COMMAND_VALUES.template)}\n` +
    `- setCardPreset：切换卡片预设，after 取值 ${JSON.stringify(COMMAND_VALUES.cardPreset)}\n` +
    `- setMapScale：地图缩放倍数（数字，如 1.1）\n` +
    `- setBackgroundColor：背景颜色（十六进制，如 "#f5f0e8"）\n` +
    `- setVisibleFields：设置可见字段，after 取值如 ["name","university"]\n` +
    `- moveText：移动文字，必须提供 targetId 和 before/after 的 {x,y} 坐标\n\n` +
    `每条命令必须是对象：\n` +
    `{"id":"cmd-<前缀>-<6位随机>","type":"...","label":"中文动作描述","risk":"low|medium|high","before":<修改前值>,"after":<修改后值>,"reason":"中文理由"}\n\n` +
    `如果用户是在提问（包含“为什么/怎么/是否/可不可以/吗/？/?”，且没有明确的修改指令），返回 {"mode":"explain","explanation":"用中文简洁回答用户问题","commands":[]}。\n\n` +
    `只输出 JSON：{"mode":"proposal"|"explain","explanation":"中文说明","commands":[...]}`;

  const data = await chatJson(config, PROPOSE_SYSTEM, userPrompt);
  if (!isRecord(data)) throw new Error("LLM 返回结果不是对象");
  const mode: "proposal" | "explain" = data.mode === "explain" ? "explain" : "proposal";
  const explanation =
    typeof data.explanation === "string" && data.explanation.trim()
      ? data.explanation.trim()
      : `已根据“${request.message}”生成修改建议。`;
  const commands: EditorCommandPayload[] = [];
  if (Array.isArray(data.commands)) {
    for (const raw of data.commands) {
      const validated = validateEditorCommandPayload(raw);
      if (validated.ok && validated.value) commands.push(validated.value);
    }
  }
  if (mode === "proposal" && commands.length === 0) throw new Error("LLM 未返回有效命令");
  return { mode, explanation, commands };
}

async function explainWithLlm(config: AiConfig, message: string, studentCount: number) {
  const data = await chatJson(
    config,
    JSON_ONLY_SYSTEM,
    `当前学生人数：${studentCount}\n用户问题：${message}\n\n只输出 JSON：{"explanation":"用中文回答用户的问题，不超过 200 字，语气简洁友好"}`,
    500,
  );
  if (!isRecord(data)) throw new Error("LLM 返回结果不是对象");
  const explanation =
    typeof data.explanation === "string" && data.explanation.trim()
      ? data.explanation.trim()
      : `关于“${message}”的说明。`;
  return { explanation };
}

export interface AiBackend {
  provider: string;
  isConfigured: boolean;
  parseData(request: ParseDataRequest): Promise<ParseDataResult>;
  proposeEdits(request: ProposeEditsRequest): Promise<ProposalResult>;
  explain(message: string, studentCount: number): Promise<ExplainResult>;
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
    async parseData(request) {
      if (!configured) return localParseData(request);
      try {
        const { candidates, unparsed } = await parseDataWithLlm(config, request);
        return { provider: PROVIDER_NAME, source: request.source, candidates, unparsed };
      } catch (error) {
        fallbackReason("parse-data", error);
        return localParseData(request);
      }
    },
    async proposeEdits(request) {
      if (!configured) return localProposeEdits(request);
      try {
        const { mode, explanation, commands } = await proposeEditsWithLlm(config, request);
        return { provider: PROVIDER_NAME, mode, explanation, commands };
      } catch (error) {
        fallbackReason("propose-edits", error);
        return localProposeEdits(request);
      }
    },
    async explain(message, studentCount) {
      if (!configured) return localExplain(message, studentCount);
      try {
        const { explanation } = await explainWithLlm(config, message, studentCount);
        return { provider: PROVIDER_NAME, mode: "explain" as const, explanation, commands: [] as EditorCommandPayload[] };
      } catch (error) {
        fallbackReason("explain", error);
        return localExplain(message, studentCount);
      }
    },
  };
}

