import { describe, expect, it } from "vitest";
import { executeAgentToolCall } from "./agent-session-tools";
import { estimateDestinationCardLayouts, listContentLayoutIssues } from "./content-layout-objects";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import type { AgentToolCall } from "./agent-risk";
import type { LayoutHealthIssue } from "./layout-health";

let studentSequence = 0;

function student(province: string, city: string, university: string): Student {
  studentSequence += 1;
  return {
    id: `student-${studentSequence}`,
    name: `学生${studentSequence}`,
    university,
    city,
    province,
    visibility: true,
  };
}

/** 默认「original」模板：画布 1500×1000、安全边距 48、地图 (350,120,800,690)。 */
function projectWith(students: Student[]): ProjectDocument {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

function toolCall(name: string, args: Record<string, unknown> = {}): AgentToolCall {
  return { id: `call-${name}`, name, arguments: args };
}

function healthIssues(project: ProjectDocument): LayoutHealthIssue[] {
  const { result } = executeAgentToolCall(project, toolCall("check_health"), undefined);
  expect(result.ok).toBe(true);
  return (JSON.parse(result.content) as { issues: LayoutHealthIssue[] }).issues;
}

/** 把某张卡摆到卡心落在 (x, y) 的位置，避免在用例里手算实测宽高。 */
function centeredPosition(project: ProjectDocument, key: string, x: number, y: number) {
  const card = estimateDestinationCardLayouts(project).find((entry) => entry.group.key === key)!;
  return { x: x - card.width / 2, y: y - card.height / 2 };
}

interface AutoLayoutPayload {
  ok: boolean;
  placements: Array<{ id: string; x: number; y: number }>;
  lostManualLayout: boolean;
}

describe("check_health (agent tool)", () => {
  it("reports exactly the issues the delivery path reports", () => {
    const project = projectWith([student("北京市", "北京市", "北京大学"), student("浙江省", "杭州市", "浙江大学")]);
    project.cards = {
      ...project.cards,
      connectorStyle: "straight",
      positions: { 北京市: { x: 640, y: 140 }, 浙江省: { x: 700, y: 180 } },
    };

    const issues = healthIssues(project);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues).toEqual(listContentLayoutIssues(project));
  });

  it("sees connector conflicts the old single-fake-card input never carried", () => {
    const project = projectWith([student("北京市", "北京市", "北京大学"), student("新疆维吾尔自治区", "乌鲁木齐市", "新疆大学")]);
    // 北京锚点在图幅东侧、新疆在西侧，而两张卡左右对调摆放：两条引线必然交叉。
    // 旧的 healthInput 根本不构造连接线，这类冲突 Agent 永远看不见。
    project.cards = {
      ...project.cards,
      connectorStyle: "straight",
      positions: {
        北京市: centeredPosition(project, "北京市", 310, 648),
        新疆维吾尔自治区: centeredPosition(project, "新疆维吾尔自治区", 1210, 648),
      },
    };

    const issues = healthIssues(project);
    expect(issues.some((issue) => issue.kind === "connector-conflict" && issue.id === "connector-北京市:connector-新疆维吾尔自治区")).toBe(true);
  });

  it("uses measured card heights instead of the blanket 180 estimate", () => {
    const project = projectWith([student("北京市", "北京市", "北京大学")]);
    // 实测高 96：y=852 时底边 948，仍在安全边距内；旧的 180 估高会伪报出画布。
    project.cards = { ...project.cards, positions: { 北京市: { x: 640, y: 852 } } };

    const issues = healthIssues(project);
    expect(issues.filter((issue) => issue.id === "北京市")).toEqual([]);
    // 已有手工位置时不再出现旧的 cards 汇总占位块。
    expect(issues.some((issue) => issue.id.includes("cards"))).toBe(false);
  });
});

describe("auto_layout (agent tool)", () => {
  it("keeps hand-placed cards exactly where the user dragged them", () => {
    const project = projectWith([student("北京市", "北京市", "北京大学"), student("浙江省", "杭州市", "浙江大学")]);
    // 刻意选一个求解器自己绝不会输出的奇数坐标，确保保留只能来自钉住。
    project.cards = { ...project.cards, positions: { 北京市: { x: 137, y: 211 } } };

    const { project: next, result } = executeAgentToolCall(project, toolCall("auto_layout"), undefined);
    expect(result.ok).toBe(true);
    expect(next.cards.positions?.["北京市"]).toEqual({ x: 137, y: 211 });
    expect(next.cards.positions?.["浙江省"]).toBeDefined();

    const payload = JSON.parse(result.content) as AutoLayoutPayload;
    expect(payload.placements.find((placement) => placement.id === "北京市")).toMatchObject({ x: 137, y: 211 });
    expect(payload.lostManualLayout).toBe(false);
  });

  it("reports lostManualLayout only when a manual position is actually dropped", () => {
    const project = projectWith([student("北京市", "北京市", "北京大学")]);
    // 残留键没有对应分组：画布上没有那张卡，位置会被丢弃。
    project.cards = { ...project.cards, positions: { 幽灵省: { x: 5, y: 5 } } };

    const { project: next, result } = executeAgentToolCall(project, toolCall("auto_layout"), undefined);
    expect(result.ok).toBe(true);
    expect(next.cards.positions).not.toHaveProperty("幽灵省");
    expect((JSON.parse(result.content) as AutoLayoutPayload).lostManualLayout).toBe(true);
  });

  it("stays a recomputation report when nothing was manually placed", () => {
    const project = projectWith([student("北京市", "北京市", "北京大学")]);
    const { result } = executeAgentToolCall(project, toolCall("auto_layout"), undefined);
    expect((JSON.parse(result.content) as AutoLayoutPayload).lostManualLayout).toBe(false);
  });
});
