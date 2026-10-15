import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, parseProjectPackage, serializeProjectPackage } from "./project-package";

describe("scoped card project compatibility", () => {
  it("preserves per-card styles, position policies and sources across an actual package round trip", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards = { ...project.cards,
      styleOverrides: { "province:北京市": { fontSize: 24, fieldTypography: { name: { color: "#123456" } }, visibleFields: ["name"] } },
      positions: { 北京市: { x: 90, y: 120 } }, positionPolicies: { "province:北京市": "locked" }, positionSources: { "province:北京市": "manual" },
    };
    const original = JSON.stringify(project.cards);
    const parsed = parseProjectPackage(serializeProjectPackage(createProjectPackage({ project, assets: [], fonts: [] })));
    expect(parsed.project.cards.styleOverrides).toEqual(project.cards.styleOverrides);
    expect(parsed.project.cards.positionPolicies).toEqual(project.cards.positionPolicies);
    expect(parsed.project.cards.positionSources).toEqual(project.cards.positionSources);
    expect(parsed.project.cards.positions).toEqual(project.cards.positions);
    parsed.project.cards.styleOverrides!["province:北京市"]!.fieldTypography!.name!.color = "#abcdef";
    expect(JSON.stringify(project.cards)).toBe(original);
  });
});
