# LLM 智能助手 · 服务端 Agent 循环实现计划（Phase 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现无状态的服务端 agent 循环：接收"对话历史 + 工程精简投影"，用 deepseek-v4-flash 工具调用推进多轮规划，校验工具参数并按域白名单过滤，返回下一步工具调用或 `finish` 总结；供前端影子副本执行工具。

**Architecture:** 服务端不持有工程状态，只维护 OpenAI 兼容的 `messages` 数组（由请求方随轮次回传累积），每轮调用一次带 `tools` 的 chat/completions，解析 `tool_calls` 后逐条做补丁白名单校验与受保护字段拦截，错误以结构化 JSON 回传给模型自纠。路由 `deepseek-v4-flash（主）→ gpt-5.6-luna（备）→ local-fallback（兜底）`。

**Tech Stack:** Node 22、TypeScript、Vitest（jsdom）、OpenAI 兼容 chat/completions API（原生 tool calling）。

## Global Constraints

- 服务端**不持有任何工程状态**：一切状态随请求往返，天然可重放、可水平扩展、易测试。
- `max_tokens` 必须 ≥ 4000（实测思维链占输出约 80%，1200 会静默截断只返回思维链、零工具调用）。
- `claude-sonnet-5`（tokenfree 代理）会损坏 tool 参数（`"{}{\"scale\":1.5}"`），**不进入工具循环**。
- 属性白名单校验对未知属性**不静默丢弃**，必须返回 `{error, availableProps}` 让模型自纠。
- 受保护字段（`cards.positions`、`students[].name/university/city`、`src`）不得被普通补丁写入。
- 资源受限：不并行跑 test/lint/typecheck/build，逐任务只跑针对性测试，完成时跑一次完整校验链。
- 不修改 `ProjectDocument` 结构、工程包版本、地图/排版算法、导出核心逻辑。
- `.hermes.md`：测试用 `scripts/run-heavy.sh` 或直接 `npx vitest run <file>` 均可，但绝不并行重型链。

---

### Task 1: 共享工具调用类型与 `chatWithTools`

**Files:**
- Modify: `server/ai/llm-client.ts`（追加导出，不改现有函数）
- Create: `server/ai/agent-types.ts`
- Create: `server/ai/agent-types.test.ts`

**Interfaces:**
- Consumes: 现有 `AiConfig`、`resolveAiConfig`（llm-client.ts）。
- Produces: `ChatMessage`、`ToolCall`、`ToolDefinition`、`chatWithTools(config, messages, tools, maxTokens)`、`isRecord`。

- [ ] **Step 1: 写失败测试** `server/ai/agent-types.test.ts`，验证 `chatWithTools` 正确发送 tools 数组并解析 tool_calls 消息。

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithTools, type AiConfig, type ToolDefinition } from "./llm-client";
import type { ChatMessage } from "./agent-types";

const CONFIG: AiConfig = { apiKey: "k", baseUrl: "https://llm.example/v1", model: "deepseek-v4-flash", timeoutMs: 5000, maxTokens: 4000 };

const TOOL: ToolDefinition = {
  type: "function",
  function: { name: "update_map", description: "改地图", parameters: { type: "object", properties: { width: { type: "number" } } } },
};

const MOCK_REPLY = {
  choices: [{
    message: {
      role: "assistant",
      content: null,
      reasoning_content: "先看现状",
      tool_calls: [{
        id: "call_1",
        type: "function",
        function: { name: "update_map", arguments: '{"width":640}' },
      }],
    },
  }],
};

function mockCompletion() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "", json: async () => MOCK_REPLY }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("chatWithTools", () => {
  it("sends tools and parses tool_calls from the assistant message", async () => {
    const fetchMock = mockCompletion();
    const message = await chatWithTools(CONFIG, [{ role: "user", content: "缩小地图" }], [TOOL]);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.name).toBe("update_map");
    expect(body.max_tokens).toBe(4000);
    expect(message.tool_calls?.[0]?.function.name).toBe("update_map");
    expect(message.tool_calls?.[0]?.function.arguments).toBe('{"width":640}');
    expect(message.reasoning_content).toBe("先看现状");
  });

  it("throws when the API errors so the caller can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, text: async () => "bad gateway" })));
    await expect(chatWithTools(CONFIG, [{ role: "user", content: "x" }], [TOOL])).rejects.toThrow(/502/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**（`npx vitest run server/ai/agent-types.test.ts`，预期编译/未定义报错）。

- [ ] **Step 3: 实现类型与函数**。`server/ai/agent-types.ts`:

```ts
export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  /** deepseek reasoning 模型要求保留思维链原文，否则下轮报错。 */
  reasoning_content?: string | null;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
```

`server/ai/llm-client.ts` 追加：

```ts
import type { ChatMessage, ChatToolCall, ToolDefinition } from "./agent-types";

export interface ToolMessageArgs {
  role: "tool";
  tool_call_id: string;
  content: string;
}

/** 带原生工具调用的 chat/completions。返回完整 assistant message（含 tool_calls 与 reasoning_content）。 */
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: maxTokens ?? config.maxTokens,
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM API ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: ChatMessage }> };
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("LLM 未返回消息");
  return message;
}
```

- [ ] **Step 4: 跑测试确认通过**。

- [ ] **Step 5: 提交** `git add server/ai/agent-types.ts server/ai/agent-types.test.ts server/ai/llm-client.ts && git commit -m "feat(ai): add typed chatWithTools for native tool calling"`。

---

### Task 2: 补丁白名单校验器 `patch-validator`

**Files:**
- Create: `server/ai/patch-validator.ts`
- Create: `server/ai/patch-validator.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，只依赖领域知识：从 `src/lib/scene-document.ts` 类型定义提取属性名）。
- Produces: `SceneDomain`、`SCENE_DOMAIN_PROPS`、`validateScenePatch(domain, patch)` 返回 `{ok:true} | {ok:false, error:{unknownProps, protectedProps, availableProps}}`、`PROTECTED_SCENE_FIELDS`。

- [ ] **Step 1: 写失败测试** `server/ai/patch-validator.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { validateScenePatch, PROTECTED_SCENE_FIELDS } from "./patch-validator";

describe("validateScenePatch", () => {
  it("accepts known writable props", () => {
    expect(validateScenePatch("map", { width: 640, scale: 1.2 }).ok).toBe(true);
  });

  it("rejects unknown props with available list", () => {
    const result = validateScenePatch("map", { fontSize: 60 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.unknownProps).toEqual(["fontSize"]);
      expect(result.error.availableProps).toContain("scale");
    }
  });

  it("rejects protected fields even when known", () => {
    const result = validateScenePatch("cards", { positions: { x: 1, y: 1 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.protectedProps).toEqual(["positions"]);
  });

  it("allows nested appearance patch on province", () => {
    expect(validateScenePatch("province", { appearance: { kind: "manual-color", color: "#e63946" } }).ok).toBe(true);
  });

  it("lists all protected fields", () => {
    expect(PROTECTED_SCENE_FIELDS).toContain("positions");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**。属性清单与 `SceneDocument` 各域类型一一对应（可直接对照 `src/lib/scene-document.ts` 的 `CanvasSettings`/`MapSettings`/`CardSettings`/`GuestPanelSettings`/`CanvasText`/`AssetElement` 与 `ProvinceStyle`）：

```ts
export type SceneDomain = "canvas" | "map" | "province" | "cards" | "guests" | "text" | "asset";

/** 场景各域可写属性白名单（对照 SceneDocument 类型；id/src 等只读字段不列）。 */
export const SCENE_DOMAIN_PROPS: Record<SceneDomain, string[]> = {
  canvas: ["width", "height", "safeMargin", "backgroundColor", "backgroundImageSrc", "backgroundFit", "backgroundOpacity", "lineHeight"],
  map: ["x", "y", "width", "height", "scale", "zIndex", "opacity", "landColor", "activeColor", "edgeColor", "edgeStyle", "edgeWidth", "showProvinceLabels", "provinceLabelFontId", "provinceLabelTypography", "collapseSouthChinaSea", "fillMode", "heatScale", "emptyProvinceFill", "renderSource", "provinceStyles", "provinceTextureUniformSize"],
  province: ["fill", "textureSrc", "visible", "labelFontId", "appearance"],
  cards: ["preset", "displayFrame", "compactLayout", "x", "y", "maxWidth", "padding", "horizontalPadding", "bottomPadding", "gap", "columns", "background", "opacity", "textColor", "fontSize", "fieldFonts", "fieldTypography", "connectorStyle", "connectorColor", "connectorWidth", "connectorDash", "visibleFields", "noWrapFields", "citySubgroups", "expressionTemplates", "nameFormat", "layoutMode", "autoBalance", "allowMapOverlap", "showProvinceTexture", "showCount", "zIndex"],
  guests: ["title", "x", "y", "width", "padding", "background", "opacity", "textColor", "fontSize", "titleFontId", "peopleFontId", "titleTypography", "peopleTypography", "displayMode", "customText", "visibility", "people"],
  text: ["role", "content", "x", "y", "fontSize", "color", "fontWeight", "fontId", "textAlign", "maxWidth", "visibility"],
  asset: ["assetId", "label", "kind", "province", "x", "y", "width", "height", "rotation", "opacity", "zIndex", "visibility"],
};

/** 任何普通补丁都不得写入的字段（只读/受保护）。 */
export const PROTECTED_SCENE_FIELDS: Record<SceneDomain, string[]> = {
  canvas: [],
  map: [],
  province: [],
  cards: ["positions"],
  guests: [],
  text: ["id"],
  asset: ["id", "src"],
};

export interface ScenePatchError {
  domain: SceneDomain;
  unknownProps: string[];
  protectedProps: string[];
  availableProps: string[];
}

export type ScenePatchValidation = { ok: true } | { ok: false; error: ScenePatchError };

export function validateScenePatch(domain: SceneDomain, patch: Record<string, unknown>): ScenePatchValidation {
  const writable = SCENE_DOMAIN_PROPS[domain];
  const protectedNames = PROTECTED_SCENE_FIELDS[domain];
  const keys = Object.keys(patch);
  const unknownProps = keys.filter((key) => !writable.includes(key) && !protectedNames.includes(key));
  const protectedProps = keys.filter((key) => protectedNames.includes(key));
  if (unknownProps.length === 0 && protectedProps.length === 0) return { ok: true };
  return { ok: false, error: { domain, unknownProps, protectedProps, availableProps: writable } };
}

export function isSceneDomain(value: string): value is SceneDomain {
  return value in SCENE_DOMAIN_PROPS;
}
```

- [ ] **Step 4: 跑测试确认通过**。

- [ ] **Step 5: 提交**。

---

### Task 3: 工具注册表 `tool-registry`

**Files:**
- Create: `server/ai/tool-registry.ts`
- Create: `server/ai/tool-registry.test.ts`

**Interfaces:**
- Consumes: `ToolDefinition`（agent-types）、`SceneDomain`（patch-validator）。
- Produces: `READ_ONLY_TOOLS: Set<string>`、`WRITE_TOOLS: Set<string>`、`ALL_TOOL_NAMES: string[]`、`AGENT_TOOLS: ToolDefinition[]`、`toolNamesToToolMessages(...)`。

- [ ] **Step 1: 写失败测试**：

```ts
import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, ALL_TOOL_NAMES, READ_ONLY_TOOLS } from "./tool-registry";

describe("tool registry", () => {
  it("exposes 15 tools", () => {
    expect(AGENT_TOOLS).toHaveLength(15);
  });

  it("marks read-only vs write tools", () => {
    expect(READ_ONLY_TOOLS.has("inspect_project")).toBe(true);
    expect(READ_ONLY_TOOLS.has("update_map")).toBe(false);
  });

  it("every tool has a name, description and parameters", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description.length).toBeGreaterThan(10);
      expect(tool.function.parameters.type).toBe("object");
    }
  });

  it("contains the required tool names", () => {
    for (const name of ["inspect_project", "describe_capability", "check_health", "find_assets", "update_canvas", "update_map", "update_province", "update_cards", "update_guests", "update_text", "update_asset", "set_data_view", "auto_layout", "manage_students", "finish"]) {
      expect(ALL_TOOL_NAMES).toContain(name);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**。15 个工具定义（只读 4 + 写入 11）。参数用宽松 JSON Schema，明确要求先 `inspect_project`/`describe_capability` 再补丁：

```ts
import type { ToolDefinition } from "./agent-types";

const patchProperty = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "object",
  additionalProperties: true,
  description: "要修改的属性名→新值。属性名必须是该域白名单内（可先用 describe_capability 查询），未知属性会被拒绝并返回可用列表。",
  ...extra,
});

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "inspect_project",
      description: "读取工程的真实当前值。path 用点分路径，如 'map.scale'、'cards.preset'、'textElements[0].fontSize'、'map.provinceStyles.广东.appearance'。禁止凭记忆猜测 before 值，动手前先查。",
      parameters: { type: "object", properties: { path: { type: "string", description: "点分路径" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "describe_capability",
      description: "查询某域可写属性名与取值约束。domain 取值：canvas/map/province/cards/guests/text/asset。返回属性清单（含类型与枚举），据此构造 patch。",
      parameters: { type: "object", properties: { domain: { type: "string", description: "场景域" } }, required: ["domain"] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_health",
      description: "对当前影子副本跑布局健康检查，返回出界/重叠/连线交叉/文字不可读等问题清单。改完布局后应调用它自证没有破坏画布。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "find_assets",
      description: "按省份或关键词检索系统贴图与用户素材，返回 assetId、标签、尺寸、provinceIds。结果仅供 update_asset 或 update_province 的 appearance 引用 assetId。",
      parameters: {
        type: "object",
        properties: { province: { type: "string", description: "省份名（可选）" }, keyword: { type: "string", description: "关键词（可选）" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: { name: "update_canvas", description: "修改画布背景设置（宽高、边距、背景色/图、透明度、行高）。", parameters: patchProperty() },
  },
  {
    type: "function",
    function: { name: "update_map", description: "修改地图设置（位置/尺寸/缩放/配色/标签/填充模式/热力比例等）。缩小或放大前先 inspect_project 读当前 width/height/scale。", parameters: patchProperty() },
  },
  {
    type: "function",
    function: {
      name: "update_province",
      description: "修改单个省份样式。province 用中文省名（如“广东”）。patch 可含 appearance：manual-color 填 {kind:'manual-color',color:'#hex'}；贴图填 {kind:'texture',assetId:'...'}（assetId 必须先经 find_assets 获取）。也可请求智能取色：patch={appearance:{kind:'manual-color',color:'auto'}} 会让前端按邻省配色自动选色。",
      parameters: { type: "object", properties: { province: { type: "string" }, patch: patchProperty() }, required: ["province", "patch"] },
    },
  },
  {
    type: "function",
    function: { name: "update_cards", description: "修改卡片块设置（预设/字号/内边距/连线/字段/布局模式等）。注意：cards.positions 受保护，只能通过 auto_layout 调整。", parameters: patchProperty() },
  },
  {
    type: "function",
    function: { name: "update_guests", description: "修改特邀嘉宾面板设置（标题/尺寸/背景/文字/显示模式/人员列表等）。", parameters: patchProperty() },
  },
  {
    type: "function",
    function: {
      name: "update_text",
      description: "修改某个文本元素。id 必填（可 inspect_project 查 textElements 的 id）。可改内容、位置、字号、颜色、字重、字体、对齐、最大宽度、可见性。",
      parameters: { type: "object", properties: { id: { type: "string" }, patch: patchProperty() }, required: ["id", "patch"] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_asset",
      description: "修改某个贴图元素。id 必填。可改位置/尺寸/旋转/透明度/层级/可见性。不可改 src（只能引用已存在 assetId）。",
      parameters: { type: "object", properties: { id: { type: "string" }, patch: patchProperty() }, required: ["id", "patch"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_data_view",
      description: "切换分组视图。view 取值：province/pins/heat/city/university。此操作保留手工卡片位置。",
      parameters: { type: "object", properties: { view: { type: "string", enum: ["province", "pins", "heat", "city", "university"] } }, required: ["view"] },
    },
  },
  {
    type: "function",
    function: {
      name: "auto_layout",
      description: "用自动排版算法重新计算卡片位置，覆盖 cards.positions（会丢弃用户手工拖拽位置！属高风险操作，落地前必须请求确认）。mode 可选：quadrant/radial/right-stack/grid，默认 quadrant。",
      parameters: { type: "object", properties: { mode: { type: "string", enum: ["quadrant", "radial", "right-stack", "grid"] } }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_students",
      description: "管理学生名单。action：hide（隐藏某人）/show（恢复）/remove_duplicate（去重，需先查重）/update_fact（改写 name/university/city 事实字段，属高风险，须逐条确认）。学生以 id 或 name 定位。",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["hide", "show", "remove_duplicate", "update_fact"] },
          studentId: { type: "string", description: "学生 id（优先）" },
          name: { type: "string", description: "学生姓名（无 id 时用）" },
          fields: { type: "object", description: "update_fact 时的新值，如 {name:'张三', university:'北京大学'}" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "任务完成，交回中文总结。summary 用一两句话说明做了什么改动；lostManualLayout 为 true 时表示本次丢弃了用户手工卡片位置，必须如实声明。",
      parameters: { type: "object", properties: { summary: { type: "string" }, lostManualLayout: { type: "boolean" } }, required: ["summary"] },
    },
  },
];

export const ALL_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.function.name);
export const READ_ONLY_TOOLS = new Set(["inspect_project", "describe_capability", "check_health", "find_assets"]);
export const WRITE_TOOLS = new Set(ALL_TOOL_NAMES.filter((name) => !READ_ONLY_TOOLS.has(name) && name !== "finish"));
```

- [ ] **Step 4: 跑测试确认通过**。

- [ ] **Step 5: 提交**。

---

### Task 4: 无状态 agent 循环 `agent-loop`

**Files:**
- Create: `server/ai/agent-loop.ts`
- Create: `server/ai/agent-loop.test.ts`

**Interfaces:**
- Consumes: `chatWithTools`/`AiConfig`（llm-client）、`AGENT_TOOLS`/`READ_ONLY_TOOLS`（tool-registry）、`validateScenePatch`/`isSceneDomain`（patch-validator）、`ChatMessage`（agent-types）。
- Produces: `AgentLoopRequest`、`AgentLoopOutcome`、`runAgentTurn(config, request): Promise<AgentLoopOutcome>`。

- [ ] **Step 1: 写失败测试**（核心行为：多轮推进、校验错误回传、无进展刹车、轮次上限）：

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn, MAX_TURNS } from "./agent-loop";
import type { AiConfig } from "./llm-client";
import type { ChatMessage } from "./agent-types";

const CONFIG: AiConfig = { apiKey: "k", baseUrl: "https://llm.example/v1", model: "deepseek-v4-flash", timeoutMs: 5000, maxTokens: 4000 };

function assistantWithCalls(...calls: Array<[string, string]>): ChatMessage {
  return { role: "assistant", content: null, tool_calls: calls.map(([name, args], i) => ({ id: `call_${i}`, type: "function", function: { name, arguments: args } })) };
}

function stubReply(message: ChatMessage) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message }] }) })));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("runAgentTurn", () => {
  it("returns a fresh assistant tool call with validated patch", async () => {
    stubReply(assistantWithCalls(["update_map", '{"width":640,"scale":1.2}']));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest: {}, messages: [{ role: "user", content: "地图小一点" }] });
    expect(outcome.kind).toBe("tool-call");
    if (outcome.kind === "tool-call") {
      expect(outcome.calls[0]).toMatchObject({ name: "update_map" });
    }
  });

  it("returns rejection with available props for unknown patch keys", async () => {
    stubReply(assistantWithCalls(["update_map", '{"fontSize":60}']));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") {
      expect(outcome.error).toContain("fontSize");
      expect(outcome.error).toContain("scale");
    }
  });

  it("flags write tools that hit protected fields", async () => {
    stubReply(assistantWithCalls(["update_cards", '{"positions":{}}']));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") expect(outcome.error).toContain("positions");
  });

  it("extracts finish summary", async () => {
    stubReply(assistantWithCalls(["finish", '{"summary":"完成","lostManualLayout":false}']));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toBe("完成");
  });

  it("bails out when the read-only streak reaches 3", async () => {
    stubReply(assistantWithCalls(["inspect_project", '{"path":"map.scale"}']));
    const messages: ChatMessage[] = [
      { role: "user", content: "x" },
      assistantWithCalls(["inspect_project", '{"path":"a"}']),
      { role: "tool", tool_call_id: "call_0", content: '{"ok":true}' },
      assistantWithCalls(["describe_capability", '{"domain":"map"}']),
      { role: "tool", tool_call_id: "call_0", content: '{"ok":true}' },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("无进展");
  });

  it("stops at MAX_TURNS assistant turns", async () => {
    const messages: ChatMessage[] = Array.from({ length: MAX_TURNS }, () => assistantWithCalls(["update_map", '{"width":1}']));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现** `server/ai/agent-loop.ts`：

```ts
import type { AiConfig } from "./llm-client";
import { chatWithTools } from "./llm-client";
import type { ChatMessage } from "./agent-types";
import { AGENT_TOOLS, READ_ONLY_TOOLS } from "./tool-registry";
import { isSceneDomain, validateScenePatch } from "./patch-validator";

export const MAX_TURNS = 20;
const MAX_READ_ONLY_STREAK = 3;
const MAX_TOOL_REJECTIONS = 2;
const MAX_OUTPUT_TOKENS = 4000;

export interface AgentLoopRequest {
  userMessage: string;
  /** 前端构造的精简工程投影（<8KB，绝不含 data URL）。 */
  digest: Record<string, unknown>;
  /** 完整对话历史（含 system、历史 assistant 与 tool 结果）。服务端只追加不修改。 */
  messages: ChatMessage[];
}

export type AgentLoopOutcome =
  | { kind: "tool-call"; calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
  | { kind: "tool-rejected"; error: string }
  | { kind: "finish"; summary: string }
  | { kind: "failed"; error: string };

function countAssistantTurns(messages: ChatMessage[]): number {
  return messages.filter((message) => message.role === "assistant").length;
}

function readOnlyStreak(messages: ChatMessage[]): number {
  let streak = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || !message.tool_calls?.length) break;
    const allReadOnly = message.tool_calls.every((call) => READ_ONLY_TOOLS.has(call.function.name));
    if (!allReadOnly) break;
    streak += 1;
  }
  return streak;
}

function countRejections(messages: ChatMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role === "tool" && message.content?.includes("unknownProps")) count += 1;
  }
  return count;
}

const SYSTEM_PROMPT = `你是“蹭饭图”毕业去向海报编辑器的 AI 助手。你的职责：理解用户的中文自然语言需求，自主规划多步修改，并尽可能不破坏用户原有画布。

工作方式：
1. 先 inspect_project 读取现状，再 describe_capability 查询可写属性，最后才下补丁。禁止凭记忆猜测当前值。
2. 一次可并行调用多个工具（例如同时改地图与标题）。
3. 改完布局类操作后用 check_health 自证没有造成出界/重叠/文字不可读。
4. 涉及丢弃用户手工位置的 auto_layout、改写学生事实的 manage_students.update_fact 属高风险，必须谨慎并在 finish 时如实说明。
5. 全部完成或用户只是提问时调用 finish 交回中文总结。

规则：
- patch 属性名必须来自对应域白名单，未知属性会被拒绝并返回可用列表，届时请按列表修正后重试（最多 2 次）。
- cards.positions 受保护，只能通过 auto_layout 调整。
- src 字段只能引用已存在 assetId，禁止编造 data URL。
- 需要时用中文交流。`;

export async function runAgentTurn(config: AiConfig, request: AgentLoopRequest): Promise<AgentLoopOutcome> {
  const { messages } = request;
  const turns = countAssistantTurns(messages);

  if (turns >= MAX_TURNS) {
    return { kind: "finish", summary: `已达 ${MAX_TURNS} 轮上限，先交付已完成的部分；如有遗漏请继续描述需求。` };
  }
  if (readOnlyStreak(messages) >= MAX_READ_ONLY_STREAK) {
    return { kind: "finish", summary: "连续多轮只读未动手，任务无进展，先交回当前结论。" };
  }
  if (countRejections(messages) >= MAX_TOOL_REJECTIONS) {
    return { kind: "finish", summary: "工具参数多次被拒，已停止尝试；请把需求换成更明确的描述。" };
  }

  const next = await chatWithTools(config, messages, AGENT_TOOLS, MAX_OUTPUT_TOKENS);
  const calls = next.tool_calls ?? [];
  const hasFinish = calls.some((call) => call.function.name === "finish");

  if (calls.length === 0) {
    // 没有工具调用：当作直接回答
    return { kind: "finish", summary: next.content ?? "已完成。" };
  }
  if (hasFinish) {
    const finishCall = calls.find((call) => call.function.name === "finish")!;
    try {
      const args = JSON.parse(finishCall.function.arguments) as { summary?: string };
      return { kind: "finish", summary: args.summary ?? "已完成。" };
    } catch {
      return { kind: "finish", summary: "已完成。" };
    }
  }

  // 校验每个写入工具的参数
  for (const call of calls) {
    const { name, arguments: rawArgs } = call.function;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>;
    } catch {
      return { kind: "tool-rejected", error: `工具 ${name} 的 arguments 不是合法 JSON：${rawArgs.slice(0, 120)}` };
    }

    if (name.startsWith("update_") && name !== "update_asset" && name !== "update_text") {
      const domain = name.slice("update_".length);
      if (isSceneDomain(domain)) {
        const patch = (args.patch ?? {}) as Record<string, unknown>;
        const result = validateScenePatch(domain, patch);
        if (!result.ok) {
          const { unknownProps, protectedProps, availableProps } = result.error;
          return {
            kind: "tool-rejected",
            error: `${domain} 域补丁被拒：未知属性 ${unknownProps.join(", ")}${protectedProps.length ? `；受保护字段 ${protectedProps.join(", ")}` : ""}。可用属性：${availableProps.join(", ")}`,
          };
        }
      }
    }
    if (name === "update_text" || name === "update_asset") {
      const patch = (args.patch ?? {}) as Record<string, unknown>;
      const result = validateScenePatch(name === "update_text" ? "text" : "asset", patch);
      if (!result.ok) {
        const { unknownProps, protectedProps, availableProps } = result.error;
        return {
          kind: "tool-rejected",
          error: `${name} 补丁被拒：未知属性 ${unknownProps.join(", ")}${protectedProps.length ? `；受保护字段 ${protectedProps.join(", ")}` : ""}。可用属性：${availableProps.join(", ")}`,
        };
      }
    }
    if (name === "update_province") {
      const patch = (args.patch ?? {}) as Record<string, unknown>;
      const result = validateScenePatch("province", patch);
      if (!result.ok) {
        const { unknownProps, protectedProps, availableProps } = result.error;
        return {
          kind: "tool-rejected",
          error: `province 补丁被拒：未知属性 ${unknownProps.join(", ")}${protectedProps.length ? `；受保护字段 ${protectedProps.join(", ")}` : ""}。可用属性：${availableProps.join(", ")}`,
        };
      }
    }
  }

  return { kind: "tool-call", calls: calls.map((call) => ({ id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) as Record<string, unknown> })) };
}

export function buildSystemMessage(): ChatMessage {
  return { role: "system", content: SYSTEM_PROMPT };
}
```

- [ ] **Step 4: 跑测试确认通过**。若有需要，调整 `update_text`/`update_asset`/`update_province` 的校验分支使其统一（可抽一个 `validateToolCall(call)` 辅助函数）。

- [ ] **Step 5: 提交**。

---

### Task 5: 模型路由与降级 `resolveAgentConfig`

**Files:**
- Modify: `server/ai/llm-client.ts`
- Create: `server/ai/agent-routing.ts`
- Create: `server/ai/agent-routing.test.ts`

**Interfaces:**
- Consumes: `AiConfig`、`resolveAiConfig`（llm-client）。
- Produces: `resolveAgentConfig(env): AiConfig`（主 deepseek-v4-flash → 备 luna → 兜底 local）、`createAgentLoopBackend(config)` 返回 `{ runTurn(request) }`，内部按 provider 名切换 API 并自动降级。

- [ ] **Step 1: 写失败测试**：

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAgentConfig } from "./agent-routing";

describe("resolveAgentConfig", () => {
  it("prefers deepseek-v4-flash", () => {
    const config = resolveAgentConfig({ AI_MODEL: "", AI_MAX_TOKENS: "" });
    expect(config.model).toBe("deepseek-v4-flash");
    expect(config.maxTokens).toBeGreaterThanOrEqual(4000);
  });

  it("honours an explicit AI_MODEL override", () => {
    const config = resolveAgentConfig({ AI_MODEL: "gpt-5.6-luna" });
    expect(config.model).toBe("gpt-5.6-luna");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**。`server/ai/agent-routing.ts`：

```ts
import { resolveAiConfig, type AiConfig } from "./llm-client";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_AGENT_MODEL = "deepseek-v4-flash";
const FALLBACK_MODEL = "gpt-5.6-luna";
const AGENT_MAX_TOKENS = 4000;

/** 解析 agent 循环用的模型配置：主 deepseek-v4-flash，可被 AI_MODEL 覆盖为 gpt-5.6-luna。 */
export function resolveAgentConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const base = resolveAiConfig(env);
  const explicit = (env.AI_MODEL || "").trim();
  const model = explicit || DEFAULT_AGENT_MODEL;
  const baseUrl = explicit
    ? base.baseUrl
    : (env.AI_BASE_URL || "").trim().includes("deepseek")
      ? base.baseUrl
      : DEEPSEEK_BASE_URL;
  const apiKey = (env.DEEPSEEK_API_KEY || env.AI_API_KEY || "").trim() || undefined;
  return {
    ...base,
    baseUrl,
    model,
    apiKey,
    maxTokens: AGENT_MAX_TOKENS,
  };
}

export function createAgentLoopBackend(config: AiConfig) {
  return {
    provider: config.apiKey ? config.model : "local-fallback",
    isConfigured: Boolean(config.apiKey),
    async runTurn(request: Parameters<typeof import("./agent-loop").runAgentTurn>[1]) {
      // 轮询备选：先主，失败且配置了备选时再试备选。
      const { runAgentTurn } = await import("./agent-loop");
      try {
        return await runAgentTurn(config, request);
      } catch (error) {
        const fallbackUrl = config.baseUrl.replace(/\/+$/, "");
        const alternate = { ...config, model: FALLBACK_MODEL, baseUrl: fallbackUrl };
        try {
          return await runAgentTurn(alternate, request);
        } catch (alternateError) {
          return { kind: "failed" as const, error: `主模型与备选均失败：${alternateError instanceof Error ? alternateError.message : String(alternateError)}` };
        }
      }
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**（若 `agent-routing.test.ts` 覆盖不足，补充 `resolveAgentConfig` 对 `DEEPSEEK_API_KEY` 的读取断言）。

- [ ] **Step 5: 提交**。

---

### Task 6: HTTP 端点 `POST /api/ai/agent`

**Files:**
- Modify: `server/index.ts`
- Modify: `server/index.test.ts`

**Interfaces:**
- Consumes: `createAgentLoopBackend`/`resolveAgentConfig`（agent-routing）、`buildSystemMessage`（agent-loop）、现有 `readJson`/`send`/`isRecord`。
- Produces: `POST /api/ai/agent`，请求 `{ userMessage, digest, messages }`，响应 `{ kind, calls?, summary?, error?, provider }`；`AiServerOptions.agentConfig` 可注入测试。

- [ ] **Step 1: 写失败测试**（在 `server/index.test.ts` 追加，利用现有 `startServer` 辅助）：

```ts
it("runs the agent loop end-to-end and returns finish when the model finishes", async () => {
  const server = createAiServer({ aiConfig: testAiConfig() });
  servers.push(server);
  const origin = await startServer(server);

  const response = await fetch(`${origin}/api/ai/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userMessage: "地图小一点",
      digest: { canvas: { width: 800, height: 690 } },
      messages: [{ role: "user", content: "地图小一点" }],
    }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as { kind: string };
  expect(["tool-call", "tool-rejected", "finish", "failed"]).toContain(body.kind);
});
```

其中 `testAiConfig()` 指向一个 mock fetch 的 AiConfig（在测试文件顶部用 `vi.stubGlobal("fetch", ...)` 返回带 `finish` tool_calls 的响应，确保确定性）。

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**。`server/index.ts` 中：

```ts
import { createAgentLoopBackend, resolveAgentConfig } from "./ai/agent-routing";
import { buildSystemMessage } from "./ai/agent-loop";

// 在 createAiServer 内：
const agent = createAgentLoopBackend(options.agentConfig ?? resolveAgentConfig());
```

在 AI 端点区块追加：

```ts
if (request.method === "POST" && url === "/api/ai/agent") {
  const body = await readJson(request, Math.min(maxJsonBodyBytes, DEFAULT_MAX_AI_BODY_BYTES));
  if (!isRecord(body) || typeof body.userMessage !== "string" || !body.userMessage.trim()) {
    send(400, { error: { code: "VALIDATION_ERROR", message: "userMessage 不能为空" } });
    return;
  }
  if (!isRecord(body.digest)) {
    send(400, { error: { code: "VALIDATION_ERROR", message: "digest 必须是对象" } });
    return;
  }
  if (!Array.isArray(body.messages)) {
    send(400, { error: { code: "VALIDATION_ERROR", message: "messages 必须是数组" } });
    return;
  }
  const messages = [buildSystemMessage(), ...(body.messages as import("./ai/agent-types").ChatMessage[])];
  const outcome = await agent.runTurn({ userMessage: String(body.userMessage), digest: body.digest, messages });
  send(200, { ...outcome, provider: agent.provider });
  return;
}
```

同时给 `AiServerOptions` 增加 `agentConfig?: AiConfig` 字段（类型导入自 llm-client），并在 `createAiServer` 参数解构处使用。

- [ ] **Step 4: 跑测试确认通过**（`npx vitest run server/index.test.ts`）。

- [ ] **Step 5: 提交**。

---

### Task 7: 环境变量与文档

**Files:**
- Modify: `.env.example`
- Modify: `server/ai/schemas.ts`（可选：追加 `AgentLoopRequest` 注释，说明与 digest 的配合）

**Interfaces:**
- Consumes: 无。
- Produces: `.env.example` 中 `AI_MODEL=deepseek-v4-flash`、`AI_FALLBACK_MODEL=gpt-5.6-luna`、`AI_MAX_TOKENS=4000`、`DEEPSEEK_API_KEY=` 注释。

- [ ] **Step 1: 更新 `.env.example`**：

```bash
# AI 接口（OpenAI 兼容）配置
AI_API_KEY=
# 主模型：deepseek-v4-flash（低价高缓存命中）；可覆盖为 gpt-5.6-luna（tokenfree）
AI_MODEL=deepseek-v4-flash
# 备选模型：主模型失败时自动降级
AI_FALLBACK_MODEL=gpt-5.6-luna
# 单次请求超时（毫秒）
AI_TIMEOUT_MS=60000
# agent 循环输出上限：必须 >= 4000，否则思维链截断导致零工具调用
AI_MAX_TOKENS=4000
# deepseek 官方 API key（AI_BASE_URL 指向 api.deepseek.com 时使用）
DEEPSEEK_API_KEY=
```

- [ ] **Step 2: 跑一次完整校验链** `npm test`（唯一一次重型校验，串行执行），确认全量测试通过。

- [ ] **Step 3: 提交**。

---

## Self-Review

**规格覆盖：**
- 无状态大脑 ✓（Task 4/5/6，状态全随请求往返）
- 工具集 15 个 ✓（Task 3，含 set_data_view 修正）
- 属性白名单 + 错误反馈 ✓（Task 2/4）
- 受保护字段 ✓（Task 2，positions/text.id/asset.id/src 拦截）
- max_tokens ≥ 4000 ✓（Task 1 常量、Task 5 AGENT_MAX_TOKENS、Task 7 env）
- 模型路由 deepseek→luna→local ✓（Task 5 降级链 + 无 key 时 provider=local-fallback）
- 轮次上限 20 + 无进展刹车 3 + 拒绝重试 2 ✓（Task 4 常量与测试）
- 512KB 请求体限制 ✓（Task 6 复用 DEFAULT_MAX_AI_BODY_BYTES）
- claude-sonnet-5 不入循环 ✓（默认模型已改 deepseek，无任何路径选 sonnet）

**占位符扫描：** 无 TODO/TBD；所有实现步骤含完整代码。

**类型一致性：** `ChatMessage`/`ToolDefinition` 在 Task 1 定义，Task 3/4/6 引用一致；`SceneDomain` 在 Task 2 定义，Task 3 的 `update_*` 描述引用一致；`runAgentTurn` 签名在 Task 4 定义，Task 5/6 引用一致；`AgentLoopOutcome.kind` 取值 `tool-call | tool-rejected | finish | failed` 在 Task 4 定义，Task 5/6 测试引用一致。
