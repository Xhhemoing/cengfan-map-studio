import { describe, expect, it } from "vitest";
import {
  PROTECTED_SCENE_FIELDS,
  validateScenePatch,
} from "./patch-validator";

describe("validateScenePatch", () => {
  it("accepts known writable properties", () => {
    expect(validateScenePatch("map", { width: 640, scale: 1.2 }).ok).toBe(true);
  });

  it("returns available properties for unknown fields", () => {
    const result = validateScenePatch("map", { fontSize: 60 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.unknownProps).toEqual(["fontSize"]);
      expect(result.error.availableProps).toContain("scale");
    }
  });

  it("rejects protected fields", () => {
    const result = validateScenePatch("cards", { positions: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.protectedProps).toEqual(["positions"]);
  });

  it("accepts a province appearance patch", () => {
    expect(validateScenePatch("province", {
      appearance: { kind: "manual-color", color: "#e63946" },
    }).ok).toBe(true);
  });

  it("exposes protected fields for the execution layer", () => {
    expect(PROTECTED_SCENE_FIELDS.cards).toContain("positions");
  });
});
