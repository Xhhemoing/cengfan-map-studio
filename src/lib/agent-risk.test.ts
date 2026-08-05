import { describe, expect, it } from "vitest";
import { classifyAgentCall, highestRisk, type AgentToolCall } from "./agent-risk";
import { createProjectDocument } from "./project-document";

const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
const call = (name: string, arguments_: Record<string, unknown>): AgentToolCall => ({ id: "call-1", name, arguments: arguments_ });

describe("classifyAgentCall", () => {
  it("treats simple style changes as low risk", () => {
    expect(classifyAgentCall(project, call("update_text", { id: "title", patch: { fontSize: 60 } })).level).toBe("low");
  });

  it("treats structural changes as medium risk", () => {
    expect(classifyAgentCall(project, call("set_data_view", { view: "city" })).level).toBe("medium");
  });

  it("treats auto layout with manual positions as high risk", () => {
    const positioned = { ...project, cards: { ...project.cards, positions: { a: { x: 1, y: 2 } } } };
    expect(classifyAgentCall(positioned, call("auto_layout", {})).level).toBe("high");
  });

  it("treats auto layout without manual positions as medium risk", () => {
    expect(classifyAgentCall(project, call("auto_layout", {})).level).toBe("medium");
  });

  it("treats fact rewrites and duplicate removal as high risk", () => {
    expect(classifyAgentCall(project, call("manage_students", { action: "update_fact" })).level).toBe("high");
    expect(classifyAgentCall(project, call("manage_students", { action: "remove_duplicate" })).level).toBe("high");
  });

  it("returns the highest level", () => {
    expect(highestRisk([{ level: "low", reason: "" }, { level: "high", reason: "" }])).toBe("high");
  });
});
