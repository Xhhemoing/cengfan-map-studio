import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  ALL_TOOL_NAMES,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
} from "./tool-registry";

describe("agent tool registry", () => {
  it("defines the 16 tools in the design", () => {
    expect(AGENT_TOOLS).toHaveLength(16);
    expect(ALL_TOOL_NAMES).toContain("inspect_project");
    expect(ALL_TOOL_NAMES).toContain("query_students");
    expect(ALL_TOOL_NAMES).toContain("finish");
  });

  it("separates read-only tools from write tools", () => {
    expect(READ_ONLY_TOOLS.has("inspect_project")).toBe(true);
    expect(READ_ONLY_TOOLS.has("query_students")).toBe(true);
    expect(READ_ONLY_TOOLS.has("update_map")).toBe(false);
    expect(WRITE_TOOLS.has("update_map")).toBe(true);
    expect(WRITE_TOOLS.has("query_students")).toBe(false);
    expect(WRITE_TOOLS.has("finish")).toBe(false);
  });

  it("lists the writable properties of each domain in its update tool description", () => {
    const descriptionOf = (name: string) => AGENT_TOOLS.find((tool) => tool.function.name === name)!.function.description;
    expect(descriptionOf("update_cards")).toContain("padding");
    expect(descriptionOf("update_cards")).toContain("connectorColor");
    expect(descriptionOf("update_map")).toContain("scale");
    expect(descriptionOf("update_text")).toContain("fontWeight");
    expect(descriptionOf("update_canvas")).toContain("safeMargin");
  });

  it("provides valid function schemas", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description.length).toBeGreaterThan(10);
      expect(tool.function.parameters.type).toBe("object");
    }
  });
});
