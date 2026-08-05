import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  ALL_TOOL_NAMES,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
} from "./tool-registry";

describe("agent tool registry", () => {
  it("defines the 15 tools in the design", () => {
    expect(AGENT_TOOLS).toHaveLength(15);
    expect(ALL_TOOL_NAMES).toContain("inspect_project");
    expect(ALL_TOOL_NAMES).toContain("finish");
  });

  it("separates read-only tools from write tools", () => {
    expect(READ_ONLY_TOOLS.has("inspect_project")).toBe(true);
    expect(READ_ONLY_TOOLS.has("update_map")).toBe(false);
    expect(WRITE_TOOLS.has("update_map")).toBe(true);
    expect(WRITE_TOOLS.has("finish")).toBe(false);
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
