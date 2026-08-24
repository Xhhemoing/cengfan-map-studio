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

  // 检查器里用户能改的字段必须同样对 AI 开放，否则 update_map/update_cards 会误报 PATCH_REJECTED。
  it("accepts the inspector-editable map appearance fields", () => {
    expect(validateScenePatch("map", {
      dataPalette: "playful",
      shadow: true,
      mapBoundaryMargin: 24,
    }).ok).toBe(true);
  });

  it("accepts the inspector-editable card presentation field", () => {
    expect(validateScenePatch("cards", { presentation: "glass-stat" }).ok).toBe(true);
  });

  it("still rejects unknown keys mixed into a newly writable patch", () => {
    const result = validateScenePatch("map", { dataPalette: "pastel", nonsense: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.unknownProps).toEqual(["nonsense"]);
      expect(result.error.availableProps).toContain("dataPalette");
    }
  });

  it("still rejects card positions alongside a writable presentation change", () => {
    const result = validateScenePatch("cards", { presentation: "standard", positions: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.protectedProps).toEqual(["positions"]);
  });

  it("exposes protected fields for the execution layer", () => {
    expect(PROTECTED_SCENE_FIELDS.cards).toContain("positions");
  });
});
