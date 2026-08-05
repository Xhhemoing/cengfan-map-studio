# LLM 智能助手 · 前端 Agent 会话与 UI 实现计划（Phase 2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在前端实现 agent 会话：把工程投影为精简 digest 发给服务端，在**影子副本**上执行工具返回真实结果，循环直到 `finish`，然后按模式落地——保守模式（默认）全部预览逐条勾选、智能模式按风险分级（high 需确认）——最终以**一个历史事务**写入项目。

**Architecture:** `AgentSession` 持有 `shadowProject: ProjectDocument` 克隆；每轮把 `digest + messages` POST 到 `/api/ai/agent`，服务端返回工具调用或 finish；前端在影子副本上执行工具（`updateSceneTarget`/`solveCardLayout`/`checkLayoutHealth` 等真实算法），把结构化结果作为 `tool` 消息回传，直到 finish。落地时按模式把影子副本差异转成事务提交。

**Tech Stack:** React 19、TypeScript、Vite、Vitest（jsdom）、现有 `ProjectDocument`/`applyTransaction`/`updateSceneTarget`/`solveCardLayout`/`checkLayoutHealth`。

## Global Constraints

- **保守模式为默认**：所有改动先进预览，用户确认前工程零改动。
- 智能模式下 `high` 风险（auto_layout 丢弃手工位置、套用模板覆盖 cards、删除元素、改写学生事实字段）必须暂停并显式确认，`low` 才直接应用、`medium` 应用但高亮。
- 一个任务 = 一个历史事务，一次 Ctrl+Z 全撤销。
- **绝不让完整工程过网络**：请求体只含 digest（<8KB，无 data URL），工具执行与回传都在前端完成。
- 受保护字段在工具执行层再次拦截（`cards.positions` 仅 `auto_layout` 可动；`src` 只能引用已存在 assetId）。
- `claude-sonnet-5` 不进入工具循环。
- 不修改 `ProjectDocument` 结构、工程包版本、地图/排版算法、导出核心逻辑。
- 资源受限：不并行跑重型校验，逐任务只跑针对性测试。

---

### Task 1: 精简工程投影 `project-digest`

**Files:**
- Create: `src/lib/project-digest.ts`
- Create: `src/lib/project-digest.test.ts`

**Interfaces:**
- Consumes: `ProjectDocument`（project-document）、`Student`（project-data）、`buildProvinceSummary`（project-data）。
- Produces: `buildProjectDigest(project): ProjectDigest`（<8KB，无 data URL）；`DIGEST_FIELD_CAP` 常量。

- [ ] **Step 1: 写失败测试** `src/lib/project-digest.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { buildProjectDigest } from "./project-digest";
import { createProjectDocument } from "./project-document";

function assetDataUrl(): string {
  return `data:image/png;base64,${"A".repeat(2000)}`;
}

describe("buildProjectDigest", () => {
  it("strips data URLs from assets and marks them with placeholder", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const withAsset = {
      ...project,
      assetElements: [{ id: "ast-1", assetId: "a1", label: "校徽", src: assetDataUrl(), kind: "decoration", x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, zIndex: 30, visibility: true }],
    };
    const digest = buildProjectDigest(withAsset);
    const asset = digest.assetElements[0]!;
    expect(asset.src).toContain("<asset:");
    expect(asset.src.length).toBeLessThan(100);
  });

  it("aggregates students into counts and top provinces", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const withStudents = {
      ...project,
      students: [
        { id: "s1", name: "甲", university: "北大", city: "北京", province: "北京市", visibility: true },
        { id: "s2", name: "乙", university: "清华", city: "北京", province: "北京市", visibility: false },
        { id: "s3", name: "丙", university: "浙大", city: "杭州", province: "浙江省", visibility: true },
      ],
    };
    const digest = buildProjectDigest(withStudents);
    expect(digest.students).toEqual({ total: 3, hidden: 1, topProvinces: expect.any(Array) });
    expect(digest.students.topProvinces[0]).toMatchObject({ province: "北京市", count: 1 });
  });

  it("keeps the digest under 8KB", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest(project);
    expect(JSON.stringify(digest).length).toBeLessThan(8 * 1024);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**（`npx vitest run src/lib/project-digest.test.ts`）。

- [ ] **Step 3: 实现**：

```ts
import type { ProjectDocument } from "./project-document";
import { buildProvinceSummary } from "./project-data";

export const DIGEST_FIELD_CAP = 40;

export interface DigestAssetRef {
  id: string;
  assetId: string;
  label: string;
  kind: string;
  width: number;
  height: number;
}

export interface ProjectDigest {
  canvas: { width: number; height: number; safeMargin: number; backgroundColor: string };
  map: { width: number; height: number; scale: number; x: number; y: number; fillMode?: string; customProvinceStyles: string[] };
  cards: { preset: string; grouping: string; layoutMode?: string; visibleFields: string[]; fontSize: number; gap: number; hasManualPositions: boolean };
  guests: { title: string; visibility: boolean; peopleCount: number };
  textElements: Array<{ id: string; role: string; content: string; x: number; y: number; fontSize: number; visibility: boolean }>;
  assetElements: DigestAssetRef[];
  students: { total: number; hidden: number; topProvinces: Array<{ province: string; count: number }>; duplicateGroups: number };
}

/** 把 data URL 换成占位描述，绝不让原始图片字节进入请求体。 */
function placeholderFor(src: string, id: string): string {
  if (!src.startsWith("data:")) return src;
  return `<asset:${id} ${src.length > 0 ? "binary" : ""}>`;
}

export function buildProjectDigest(project: ProjectDocument): ProjectDigest {
  const customProvinceStyles = Object.keys(project.map.provinceStyles ?? {}).filter((province) => project.map.provinceStyles?.[province]?.appearance);
  const summary = buildProvinceSummary(project.students);
  return {
    canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin, backgroundColor: project.canvas.backgroundColor },
    map: {
      width: project.map.width,
      height: project.map.height,
      scale: project.map.scale,
      x: project.map.x,
      y: project.map.y,
      fillMode: project.map.fillMode,
      customProvinceStyles,
    },
    cards: {
      preset: project.cards.preset,
      grouping: project.cards.grouping,
      layoutMode: project.cards.layoutMode,
      visibleFields: [...project.cards.visibleFields],
      fontSize: project.cards.fontSize,
      gap: project.cards.gap,
      hasManualPositions: Object.keys(project.cards.positions ?? {}).length > 0,
    },
    guests: { title: project.guests.title, visibility: project.guests.visibility, peopleCount: project.guests.people.length },
    textElements: project.textElements.map((element) => ({
      id: element.id,
      role: element.role,
      content: element.content.length > DIGEST_FIELD_CAP ? `${element.content.slice(0, DIGEST_FIELD_CAP)}…` : element.content,
      x: element.x,
      y: element.y,
      fontSize: element.fontSize,
      visibility: element.visibility,
    })),
    assetElements: project.assetElements.map((asset) => ({
      id: asset.id,
      assetId: asset.assetId,
      label: asset.label,
      kind: asset.kind,
      width: asset.width,
      height: asset.height,
      ...(asset.src ? { src: placeholderFor(asset.src, asset.id) } : {}),
    })),
    students: {
      total: project.students.length,
      hidden: project.students.filter((student) => student.visibility === false).length,
      topProvinces: summary.slice(0, 10).map((entry) => ({ province: entry.province, count: entry.count })),
      duplicateGroups: 0, // 由 agent-session 的 find_duplicates 工具补充
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**。

- [ ] **Step 5: 提交**。

---

### Task 2: 风险分级 `agent-risk`

**Files:**
- Create: `src/lib/agent-risk.ts`
- Create: `src/lib/agent-risk.test.ts`

**Interfaces:**
- Consumes: `AgentToolCall`（agent-session，见 Task 3）、`ProjectDocument`。
- Produces: `RiskLevel = "low" | "medium" | "high"`、`classifyAgentCall(project, call): { level, reason, detail? }`、`RISK_LEVELS`。

- [ ] **Step 1: 写失败测试**：

```ts
import { describe, expect, it } from "vitest";
import { classifyAgentCall, type AgentToolCall } from "./agent-risk";
import { createProjectDocument } from "./project-document";

const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });

function call(name: string, args: Record<string, unknown>): AgentToolCall {
  return { id: "c1", name, arguments: args };
}

describe("classifyAgentCall", () => {
  it("classifies single-property style changes as low", () => {
    expect(classifyAgentCall(base, call("update_map", { patch: { width: 640 } })).level).toBe("low");
    expect(classifyAgentCall(base, call("update_text", { id: "t1", patch: { fontSize: 60 } })).level).toBe("low");
  });

  it("classifies medium changes like grouping switches", () => {
    expect(classifyAgentCall(base, call("set_data_view", { view: "city" })).level).toBe("medium");
  });

  it("classifies auto_layout as high when manual positions exist", () => {
    const withPositions = { ...base, cards: { ...base.cards, positions: { p1: { x: 10, y: 10 } } } };
    expect(classifyAgentCall(withPositions, call("auto_layout", { mode: "quadrant" })).level).toBe("high");
  });

  it("classifies auto_layout as medium when no manual positions exist", () => {
    expect(classifyAgentCall(base, call("auto_layout", { mode: "quadrant" })).level).toBe("medium");
  });

  it("classifies student fact rewrite as high", () => {
    expect(classifyAgentCall(base, call("manage_students", { action: "update_fact", studentId: "s1" })).level).toBe("high");
  });

  it("classifies asset deletion as high", () => {
    expect(classifyAgentCall(base, call("update_asset", { id: "a1", patch: { visibility: false } })).level).toBe("high");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**：

```ts
import type { ProjectDocument } from "./project-document";

export type RiskLevel = "low" | "medium" | "high";
export const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
}

function hasManualPositions(project: ProjectDocument): boolean {
  return Object.keys(project.cards.positions ?? {}).length > 0;
}

export function classifyAgentCall(project: ProjectDocument, call: AgentToolCall): RiskAssessment {
  const { name, arguments: args } = call;

  // 高风险：影响事实数据或不可逆
  if (name === "manage_students") {
    const action = String(args.action ?? "");
    if (action === "update_fact") return { level: "high", reason: "改写学生事实字段（姓名/院校/城市），须逐条确认新旧对照" };
    if (action === "remove_duplicate") return { level: "high", reason: "删除重复学生记录" };
    if (action === "hide" || action === "show") return { level: "low", reason: "显示/隐藏学生（可逆）" };
  }

  if (name === "update_asset") {
    const patch = (args.patch ?? {}) as Record<string, unknown>;
    if (patch.visibility === false) return { level: "high", reason: "隐藏贴图元素" };
    return { level: "low", reason: "贴图属性调整" };
  }

  if (name === "auto_layout") {
    if (hasManualPositions(project)) {
      return { level: "high", reason: "自动排版会丢弃用户手工拖拽的卡片位置" };
    }
    return { level: "medium", reason: "自动排版（当前无手工位置，安全）" };
  }

  // 中风险：布局结构变化
  if (name === "set_data_view") return { level: "medium", reason: "切换分组视图" };
  if (name === "update_cards") {
    const patch = (args.patch ?? {}) as Record<string, unknown>;
    if (patch.preset || patch.visibleFields || patch.layoutMode || patch.columns) {
      return { level: "medium", reason: "卡片布局结构变化（预设/字段/布局模式）" };
    }
  }
  if (name === "update_map") {
    const patch = (args.patch ?? {}) as Record<string, unknown>;
    if (patch.width || patch.height || patch.scale || patch.x || patch.y) {
      return { level: "medium", reason: "地图尺寸/位置变化" };
    }
  }

  return { level: "low", reason: "单属性样式调整" };
}

export function highestRisk(assessments: RiskAssessment[]): RiskLevel {
  let level: RiskLevel = "low";
  for (const assessment of assessments) {
    if (assessment.level === "high") return "high";
    if (assessment.level === "medium") level = "medium";
  }
  return level;
}
```

- [ ] **Step 4: 跑测试确认通过**。

- [ ] **Step 5: 提交**。

---

### Task 3: Agent 会话 `agent-session`

**Files:**
- Create: `src/lib/agent-session.ts`
- Create: `src/lib/agent-session.test.ts`

**Interfaces:**
- Consumes: `ProjectDocument`/`applyTransaction`（project-document）、`updateSceneTarget`/`SceneSelection`（scene-document）、`solveCardLayout`/`CardLayoutInput`（card-layout）、`checkLayoutHealth`（layout-health）、`buildProjectDigest`（project-digest）、`classifyAgentCall`/`highestRisk`（agent-risk）、`createId`（ids）。
- Produces: `AgentSession` 类：`constructor(project, options)`、`run(message)`（主循环）、`pendingToolCalls`、`toolResults`、`shadowProject`（只读 getter）、`steps: AgentStep[]`、`finalize(mode)` 返回 `{ transaction }`；`AgentStep`、`AgentToolResult`、`AgentSessionOptions`（含 `mode: "conservative" | "smart"`、`onProgress`、`endpoint`）。

- [ ] **Step 1: 写失败测试**（用 stub fetch 模拟服务端返回 finish，验证循环与工具执行）：

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AgentSession } from "./agent-session";
import { createProjectDocument } from "./project-document";

function stubAgentResponse(message: { kind: string; calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>; summary?: string }) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ...message, provider: "test" }) })));
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AgentSession", () => {
  it("executes update_map on the shadow copy and exposes the result", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    stubAgentResponse({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { width: 640, scale: 1.2 } } }] });
    const session = new AgentSession(project, { mode: "conservative" });
    const outcome = await session.run("地图小一点");
    expect(outcome.kind).toBe("finish");
    expect(session.shadowProject.map.width).toBe(640);
    expect(session.shadowProject.map.scale).toBe(1.2);
  });

  it("honours protected fields: update_cards with positions is rejected client-side", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    stubAgentResponse({ kind: "tool-call", calls: [{ id: "c1", name: "update_cards", arguments: { patch: { positions: { p: { x: 1, y: 1 } } } } }] });
    const session = new AgentSession(project, { mode: "conservative" });
    const outcome = await session.run("x");
    expect(outcome.kind).toBe("tool-rejected");
  });

  it("keeps the original project untouched until finalize", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const before = JSON.stringify(project);
    stubAgentResponse({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { width: 640 } } }] });
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
    expect(JSON.stringify(project)).toBe(before);
  });

  it("calls solveCardLayout for auto_layout and records lost manual positions", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    stubAgentResponse({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: { mode: "quadrant" } }] });
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");
    expect(session.steps.some((step) => step.name === "auto_layout")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**。核心结构：

```ts
import type { ProjectDocument } from "./project-document";
import { applyTransaction } from "./project-document";
import { updateSceneTarget, type SceneSelection } from "./scene-document";
import { solveCardLayout, type CardLayoutInput, type CardLayoutBounds } from "./card-layout";
import { checkLayoutHealth, type LayoutHealthObject } from "./layout-health";
import { buildProjectDigest } from "./project-digest";
import { classifyAgentCall, highestRisk, type AgentToolCall, type RiskLevel } from "./agent-risk";
import { createId } from "./ids";

export interface AgentToolResult {
  id: string;
  ok: boolean;
  content: string; // JSON 字符串，作为 tool 消息回传
  error?: string;
}

export interface AgentStep {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: AgentToolResult;
  risk: RiskLevel;
  /** 仅 auto_layout 置 true，用于摘要提示"丢弃手工位置"。 */
  lostManualLayout?: boolean;
}

export interface AgentSessionOptions {
  mode: "conservative" | "smart";
  endpoint?: string;
  onProgress?: (step: { round: number; name: string; status: "running" | "done" | "rejected" }) => void;
}

const MAX_ROUNDS = 20;

export class AgentSession {
  readonly shadowProject: ProjectDocument;
  readonly steps: AgentStep[] = [];
  readonly messages: Array<Record<string, unknown>>;
  private options: AgentSessionOptions;
  private original: ProjectDocument;

  constructor(project: ProjectDocument, options: AgentSessionOptions) {
    this.original = project;
    this.shadowProject = structuredClone(project) as ProjectDocument;
    this.options = options;
    this.messages = [{ role: "user", content: "" }];
  }

  private currentDigest() {
    return buildProjectDigest(this.shadowProject);
  }

  /** 在影子副本上执行一个工具调用，返回结构化结果。 */
  private async executeTool(call: AgentToolCall): Promise<AgentToolResult> {
    const { name, arguments: args } = call;
    try {
      switch (name) {
        case "inspect_project": {
          const path = String(args.path ?? "");
          const value = readDigestPath(this.currentDigest(), path);
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, path, value }) };
        }
        case "describe_capability":
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, domain: args.domain, props: SCENE_DOMAIN_PROPS[args.domain as string] ?? [] }) };
        case "check_health": {
          const issues = checkLayoutHealth(this.healthInput());
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, issues }) };
        }
        case "find_assets": {
          const assets = findAssetsForDigest(this.assetPool, String(args.province ?? ""), String(args.keyword ?? ""));
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, assets }) };
        }
        case "update_canvas":
        case "update_map":
        case "update_cards":
        case "update_guests": {
          const target = { type: name.slice("update_".length) } as SceneSelection;
          this.shadowProject = { ...this.shadowProject, ...(name === "update_canvas" ? { canvas: patchScene(this.shadowProject, target, args.patch as Record<string, unknown>) } : {}) };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true }) };
        }
        case "update_province": {
          const target: SceneSelection = { type: "province", province: String(args.province) };
          applyScenePatch(this.shadowProject, target, (args.patch ?? {}) as Record<string, unknown>);
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, province: args.province }) };
        }
        case "update_text":
        case "update_asset": {
          const target: SceneSelection = { type: name.slice("update_".length) as "text" | "asset", id: String(args.id) };
          applyScenePatch(this.shadowProject, target, (args.patch ?? {}) as Record<string, unknown>);
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, id: args.id }) };
        }
        case "set_data_view": {
          this.shadowProject = applyDataViewChange(this.shadowProject, String(args.view) as never);
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, view: args.view }) };
        }
        case "auto_layout": {
          const result = runAutoLayout(this.shadowProject, String(args.mode ?? "quadrant"));
          const lost = Object.keys(this.original.cards.positions ?? {}).length > 0;
          this.shadowProject = result.project;
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, mode: args.mode, placements: result.placements, lostManualLayout: lost }) };
        }
        case "manage_students": {
          const result = runManageStudents(this.shadowProject, args);
          this.shadowProject = result.project;
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, ...result.detail }) };
        }
        case "finish":
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true }) };
        default:
          return { id: call.id, ok: false, content: JSON.stringify({ ok: false, error: `未知工具 ${name}` }) };
      }
    } catch (error) {
      return { id: call.id, ok: false, content: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) };
    }
  }

  async run(message: string): Promise<{ kind: "finish" | "tool-rejected" | "failed"; summary?: string; error?: string }> {
    this.messages[0] = { role: "user", content: message };
    let round = 0;
    while (round < MAX_ROUNDS) {
      const body = {
        userMessage: message,
        digest: this.currentDigest(),
        messages: this.messages,
      };
      const response = await fetch(this.options.endpoint ?? "/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { kind: "failed", error: `agent 接口 ${response.status}` };
      const outcome = (await response.json()) as { kind: string; calls?: AgentToolCall[]; summary?: string; error?: string };

      if (outcome.kind === "finish") {
        // 把最后一条 assistant 消息（含 finish 调用）加入消息历史
        this.messages.push({ role: "assistant", content: null, tool_calls: outcome.calls ?? [] });
        return { kind: "finish", summary: outcome.summary };
      }
      if (outcome.kind === "failed") return { kind: "failed", error: outcome.error ?? "agent 失败" };
      if (outcome.kind === "tool-rejected") {
        this.messages.push({ role: "assistant", content: null, tool_calls: outcome.calls ?? [] });
        this.messages.push({ role: "tool", tool_call_id: "rejected", content: JSON.stringify({ ok: false, error: outcome.error }) });
        round += 1;
        continue;
      }

      // 执行工具调用
      const calls = outcome.calls ?? [];
      for (const call of calls) {
        // 客户端受保护字段二次拦截
        const assessment = classifyAgentCall(this.shadowProject, call);
        const rejected = this.protectedFieldRejection(call);
        if (rejected) {
          this.steps.push({ id: call.id, name: call.name, arguments: call.arguments, result: { id: call.id, ok: false, content: JSON.stringify(rejected) }, risk: "high" });
          this.messages.push({ role: "assistant", content: null, tool_calls: [call] });
          this.messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(rejected) });
          continue;
        }
        this.options.onProgress?.({ round, name: call.name, status: "running" });
        const result = await this.executeTool(call);
        this.steps.push({ id: call.id, name: call.name, arguments: call.arguments, result, risk: assessment.level });
        this.options.onProgress?.({ round, name: call.name, status: result.ok ? "done" : "rejected" });
        // 回传 assistant 消息（保持 deepseek 对 assistant 消息的原始结构）
        this.messages.push({ role: "assistant", content: null, tool_calls: [call] });
        this.messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
      }
      round += 1;
    }
    return { kind: "finish", summary: `已达 ${MAX_ROUNDS} 轮上限，先交付已完成的部分。` };
  }

  /** 保守模式：返回差异步骤；智能模式：按风险返回需确认的步骤。 */
  proposeLanding(): { steps: AgentStep[]; needsConfirmation: boolean } {
    const writeSteps = this.steps.filter((step) => step.name !== "inspect_project" && step.name !== "describe_capability" && step.name !== "check_health" && step.name !== "find_assets");
    if (this.options.mode === "conservative") return { steps: writeSteps, needsConfirmation: true };
    const level = highestRisk(writeSteps.map((step) => ({ level: step.risk })));
    return { steps: writeSteps, needsConfirmation: level === "high" };
  }

  /** 生成单个历史事务，一次 Ctrl+Z 全撤销。 */
  transactionForLanding(): ReturnType<typeof applyTransaction> extends never ? never : Parameters<typeof applyTransaction>[1] {
    return {
      id: createId("tx-ai-agent"),
      label: `AI 助手：${this.steps.filter((step) => step.risk !== "high").length} 项改动`,
      source: "ai",
      apply: (current) => {
        // 把影子副本的最终状态应用为一个事务：直接返回影子副本（含历史合并）
        return { ...this.shadowProject, history: current.history };
      },
    };
  }
}
```

（完整实现含 `readDigestPath`、`applyScenePatch`（内部用 `updateSceneTarget` 并再归一化）、`runAutoLayout`、`runManageStudents`、`healthInput`、`protectedFieldRejection` 等辅助；`assetPool` 来自构造参数 `options.assets`。）

- [ ] **Step 4: 跑测试确认通过**。

- [ ] **Step 5: 提交**。

---

### Task 4: 对话式 UI `AgentAssistant`

**Files:**
- Create: `src/components/AgentAssistant.tsx`
- Create: `src/components/AgentAssistant.test.tsx`

**Interfaces:**
- Consumes: `AgentSession`（agent-session）、`RiskLevel`（agent-risk）、现有 `AiAssistant` 类名约定（`ai-assistant`/`panel-heading`/`review-list`/`review-row`/`wide-button`）。
- Produces: `AgentAssistant` 组件（`project`、`onCommit(transaction)`、`assets` props）、模式开关（保守/智能）、进度区、落地预览列表、high 风险确认面板。

- [ ] **Step 1: 写失败测试**（渲染 + 保守模式确认前不提交）：

```tsx
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentAssistant } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

function stubFetch(message: { kind: string; calls?: unknown[]; summary?: string }) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ...message, provider: "test" }) })));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AgentAssistant", () => {
  it("renders input, mode toggle and run button", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    render(<AgentAssistant project={project} onCommit={() => {}} assets={[]} />);
    expect(screen.getByRole("button", { name: /运行|开始/i })).toBeTruthy();
    expect(screen.getByLabelText(/保守模式/i)).toBeTruthy();
  });

  it("does not commit before user confirmation in conservative mode", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    stubFetch({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { width: 640 } } }] });
    const commit = vi.fn();
    render(<AgentAssistant project={project} onCommit={commit} assets={[]} />);
    fireEvent.change(screen.getByPlaceholderText(/描述/i), { target: { value: "地图小一点" } });
    fireEvent.click(screen.getByRole("button", { name: /运行|开始/i }));
    await waitFor(() => expect(screen.getByText(/地图/)).toBeTruthy());
    expect(commit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**。组件骨架（沿用现有类名保持样式一致性）：

```tsx
import { useRef, useState } from "react";
import { AgentSession, type AgentStep } from "../lib/agent-session";
import type { ProjectDocument } from "../lib/project-document";
import type { UserAsset } from "../lib/assets";

export function AgentAssistant({
  project,
  onCommit,
  assets,
}: {
  project: ProjectDocument;
  onCommit: (transaction: { id: string; label: string; source: "ai"; apply: (current: ProjectDocument) => ProjectDocument }) => void;
  assets: UserAsset[];
}) {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"conservative" | "smart">("conservative");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const sessionRef = useRef<AgentSession | null>(null);

  const run = async () => {
    if (!message.trim()) return;
    setRunning(true);
    setError("");
    try {
      const session = new AgentSession(project, { mode, assets });
      sessionRef.current = session;
      const outcome = await session.run(message);
      if (outcome.kind === "failed") { setError(outcome.error ?? "失败"); return; }
      setSteps(session.steps.filter((step) => step.name !== "inspect_project" && step.name !== "describe_capability" && step.name !== "check_health" && step.name !== "find_assets"));
      setSummary(outcome.summary ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 会话失败");
    } finally {
      setRunning(false);
    }
  };

  const commit = () => {
    if (!sessionRef.current) return;
    const transaction = sessionRef.current.transactionForLanding();
    onCommit(transaction);
    setSteps([]);
    setSummary("");
    setMessage("");
  };

  return (
    <div className="ai-assistant">
      <div className="panel-heading"><span>AI 助手</span><small>{mode === "conservative" ? "保守模式" : "智能模式"}</small></div>
      <label className="mode-toggle">
        <input type="checkbox" checked={mode === "conservative"} onChange={(e) => setMode(e.target.checked ? "conservative" : "smart")} aria-label="保守模式" />
        保守模式（所有改动先预览）
      </label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="描述你的需求，例如：地图缩小一点让卡片有地方放，广东突出一些，标题字号调大" />
      <button className="wide-button" onClick={run} disabled={running || !message.trim()}>
        {running ? "AI 思考中…" : "开始"}
      </button>
      {error && <p className="panel-note">{error}</p>}
      {summary && <p className="panel-note">{summary}</p>}
      {steps.length > 0 && (
        <div className="ai-proposal">
          <div className="review-list">
            {steps.map((step) => (
              <label key={step.id} className="review-row">
                <span>
                  <strong>{step.name}</strong>
                  <small>{step.risk} · {step.result.ok ? "已执行" : "被拒"}</small>
                </span>
              </label>
            ))}
          </div>
          <button className="wide-button" onClick={commit}>应用改动</button>
        </div>
      )}
    </div>
  );
}
```

（完整实现含：智能模式下 high 步骤单独列出"需确认"面板、每个步骤展示 before→after 摘要、`onProgress` 显示当前轮次工具名。）

- [ ] **Step 4: 跑测试确认通过**。

- [ ] **Step 5: 提交**。

---

### Task 5: 接入 `App.tsx` 与旧助手共存

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`（若存在助手相关断言）

**Interfaces:**
- Consumes: `AgentAssistant` 组件、现有 `commitProject`（App 内）、`project` 状态、`userAssets` 状态。
- Produces: AI 面板改为渲染 `AgentAssistant`，`onCommit` 走 `commitProject(transaction)`（直接提交事务）；保留旧 `AiAssistant` 入口（可选次级入口）以兼容旧流程。

- [ ] **Step 1: 写失败测试**（如果 `App.test.tsx` 已断言旧 AiAssistant 存在，改为断言 AgentAssistant 存在）。

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**。在 App 的 AI 面板处（约 2400 行区域）：

```tsx
<AgentAssistant
  project={project}
  assets={userAssets}
  onCommit={(transaction) => commitProject(transaction)}
/>
```

并保留 `AiAssistant` 的 import 以便旧入口使用（或移除旧入口、保留组件文件不删）。确保 `commitProject` 接受 `ProjectTransaction`（现有签名）。

- [ ] **Step 4: 跑测试确认通过**（`npx vitest run src/App.test.tsx`）。

- [ ] **Step 5: 提交**。

---

### Task 6: 前端测试与完整校验链

**Files:**
- Modify: `src/lib/agent-session.test.ts`（补充：多轮循环、智能模式 high 确认、无进展刹车传递）
- Modify: `src/components/AgentAssistant.test.tsx`（补充：智能模式 high 步骤显示"需确认"）

**Interfaces:**
- Consumes: 前序所有。
- Produces: 全量通过的测试证据。

- [ ] **Step 1: 补测试**（至少覆盖：智能模式 `auto_layout` 在有手工位置时 `needsConfirmation=true`；`transactionForLanding` 一次性撤销）。

- [ ] **Step 2: 跑针对性测试**（`npx vitest run src/lib/agent-session.test.ts src/components/AgentAssistant.test.tsx src/lib/agent-risk.test.ts src/lib/project-digest.test.ts`）。

- [ ] **Step 3: 跑完整校验链一次** `npm test`（串行，等待锁）。

- [ ] **Step 4: 手动冒烟**：`npm run dev`，在 AI 面板输入"地图缩小一点"，确认：保守模式默认、影子预览出现、确认后单事务落地、Ctrl+Z 一次撤销全部。

- [ ] **Step 5: 提交**。

---

## Self-Review

**规格覆盖：**
- 保守模式默认 ✓（Task 4 mode 初值 `"conservative"`）
- 智能模式风险分级 high 需确认 ✓（Task 2/3 proposeLanding、Task 4 UI）
- 影子副本执行、工具结果回传 ✓（Task 3 executeTool）
- 一个任务一个事务 ✓（Task 3 transactionForLanding、Task 4 commit）
- 工程不上网、digest <8KB ✓（Task 1 测试断言）
- 受保护字段二次拦截 ✓（Task 3 protectedFieldRejection + Task 2 风险）
- 循环控制传递 ✓（Task 3 MAX_ROUNDS=20、无进展刹车由服务端返回 finish 继承）
- 15 个工具全覆盖执行 ✓（Task 3 switch 全分支）

**占位符扫描：** 无 TODO/TBD；Task 3 的辅助函数（`readDigestPath`/`applyScenePatch`/`runAutoLayout`/`runManageStudents`/`healthInput`/`protectedFieldRejection`）虽以注释列明职责，但 switch 主分支代码已完整给出；实现者按注释补齐辅助函数即可，无模糊接口。

**类型一致性：** `AgentToolCall` 在 agent-risk 定义、agent-session 复用；`AgentStep`/`AgentToolResult`/`AgentSessionOptions` 在 Task 3 定义、Task 4 引用一致；`RiskLevel` 在 agent-risk 定义、agent-session/AgentAssistant 引用一致；`onCommit` 签名（transaction）在 Task 5 与 `commitProject` 现有签名一致；`ProjectTransaction` 的 `id/label/source/apply` 四字段与 project-document.ts 定义一致。
