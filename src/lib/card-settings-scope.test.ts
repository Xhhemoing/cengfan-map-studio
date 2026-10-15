import { applyTransaction, createProjectDocument, redoTransaction as redo, undoTransaction as undo } from "./project-document";
import { createSceneTransaction } from "./inspector-operations";
import { describe, expect, it } from "vitest";
import { createDefaultScene, normalizeScene, updateSceneTarget } from "./scene-document";
import { getCardPositionPolicy, getCardPositionSource, getSelectedCardIds, patchCardStyles, resetCardStyles, resolveCardSettings, setCardPositionPolicy } from "./card-settings-scope";

const cards = () => createDefaultScene("original").cards;

describe("scoped card styles", () => {
  it("modifies only the target and inherits future global defaults by field", () => {
    const original = { ...cards(), fieldTypography: { name: { fontSize: 12, color: "#112233" }, title: { fontSize: 18 } } };
    const next = patchCardStyles(original, ["北京市"], { fieldTypography: { name: { fontSize: 24 } }, background: "#abcdef" });
    expect(next.background).toBe(original.background);
    expect(resolveCardSettings(next, "北京市").fieldTypography?.name).toEqual({ fontSize: 24, color: "#112233" });
    expect(resolveCardSettings(next, "上海市").fieldTypography?.name?.fontSize).toBe(12);
    const changedGlobal = { ...next, textColor: "#445566", fieldTypography: { ...next.fieldTypography, name: { fontSize: 16, color: "#445566" } } };
    expect(resolveCardSettings(changedGlobal, "北京市").fieldTypography?.name).toEqual({ fontSize: 24, color: "#445566" });
    expect(resolveCardSettings(changedGlobal, "北京市").textColor).toBe("#445566");
  });
  it("keeps independent per-field choices when editing multiple selected cards", () => {
    let current = patchCardStyles(cards(), ["A"], { fieldTypography: { name: { color: "#123456" } } });
    current = patchCardStyles(current, ["B"], { fieldTypography: { name: { color: "#abcdef" } } });
    current = patchCardStyles(current, ["A", "B"], { fieldTypography: { name: { fontSize: 24 } } });
    expect(resolveCardSettings(current, "A").fieldTypography?.name).toEqual({ color: "#123456", fontSize: 24 });
    expect(resolveCardSettings(current, "B").fieldTypography?.name).toEqual({ color: "#abcdef", fontSize: 24 });
  });
  it("namespaces card identities by grouping and restores inheritance by deleting overrides", () => {
    const current = patchCardStyles(cards(), ["北京市"], { fontSize: 24 });
    expect(resolveCardSettings({ ...current, grouping: "city" }, "北京市").fontSize).toBe(current.fontSize);
    expect(resolveCardSettings(current, "北京市").fontSize).toBe(24);
    expect(resetCardStyles(current, ["北京市"]).styleOverrides).toEqual({});
  });
  it("rejects structural/local placement keys and normalizes imported visual data", () => {
    const current = patchCardStyles(cards(), ["A"], { grouping: "university", positions: { A: { x: 1, y: 2 } }, fontSize: 600, maxWidth: 1 });
    const effective = resolveCardSettings(current, "A");
    expect(effective.grouping).toBe("province");
    expect(effective.positions).toEqual(cards().positions);
    expect(effective.fontSize).toBe(48);
    expect(effective.maxWidth).toBe(80);
    expect(resolveCardSettings(patchCardStyles(cards(), ["A"], { visibleFields: ["university", "name"] }), "A").visibleFields).toEqual(["university", "name"]);
    const normalized = normalizeScene({ ...createDefaultScene("original"), cards: current });
    expect(normalized.cards.styleOverrides).toEqual(current.styleOverrides);
  });
  it("routes a scoped scene patch without touching other styles, and clears inheritance on reset", () => {
    const scene = createDefaultScene("original");
    const updated = updateSceneTarget(scene, { type: "cards", ids: ["A"] }, { background: "#eeeeee", grouping: "city" });
    expect(updated.cards.grouping).toBe("province");
    expect(resolveCardSettings(updated.cards, "A").background).toBe("#eeeeee");
    expect(resolveCardSettings(updated.cards, "B").background).toBe(scene.cards.background);
    expect(updateSceneTarget(updated, { type: "cards", ids: ["A"] }, { resetStyleOverrides: true }).cards.styleOverrides).toEqual({});
  });
});

describe("card position policies", () => {
  it("keeps legacy positions without interpreting them as explicit locks", () => {
    const old = { ...cards(), positions: { A: { x: 20, y: 40 } } };
    expect(getCardPositionPolicy(old, "A")).toBe("preserve");
    expect(getCardPositionSource(old, "A")).toBe("legacy");
    expect(getCardPositionPolicy(old, "B")).toBe("auto");
    const locked = setCardPositionPolicy(old, ["A"], "locked");
    expect(getCardPositionPolicy(locked, "A")).toBe("locked");
    expect(getCardPositionPolicy({ ...locked, grouping: "city" }, "A")).toBe("preserve");
    const automatic = setCardPositionPolicy(locked, ["A"], "auto");
    expect(automatic.positions?.A).toBeUndefined();
    expect(getCardPositionPolicy(automatic, "A")).toBe("auto");
  });
});


describe("scoped edit transaction restoration", () => {
  it("restores scoped styles and locked position state in one undo/redo step", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards.positions = { A: { x: 40, y: 50 } };
    const changed = applyTransaction(project, createSceneTransaction({ type: "cards", ids: ["A"] }, { fontSize: 24, positionPolicy: "locked" }));
    expect(getCardPositionPolicy(changed.cards, "A")).toBe("locked");
    expect(resolveCardSettings(changed.cards, "A").fontSize).toBe(24);
    const previous = undo(changed);
    expect(getCardPositionPolicy(previous.cards, "A")).toBe("preserve");
    expect(resolveCardSettings(previous.cards, "A").fontSize).toBe(project.cards.fontSize);
    const again = redo(previous);
    expect(getCardPositionPolicy(again.cards, "A")).toBe("locked");
    expect(resolveCardSettings(again.cards, "A").fontSize).toBe(24);
  });
});


describe("card size and readability constraints", () => {
  it("normalizes content width ranges and keeps a target font floor without changing actual typography", () => {
    const scene = createDefaultScene("original");
    const normalized = normalizeScene({ ...scene, cards: { ...scene.cards, maxWidth: 200, minWidth: 900, widthMode: "content", minFontSize: 24, fontSize: 12 } });
    expect(normalized.cards.minWidth).toBe(200);
    expect(normalized.cards.widthMode).toBe("content");
    expect(normalized.cards.minFontSize).toBe(24);
    expect(normalized.cards.fontSize).toBe(12);
    const local = patchCardStyles(normalized.cards, ["A"], { widthMode: "content", minWidth: 90, maxWidth: 150, minFontSize: 18 });
    expect(resolveCardSettings(local, "A")).toMatchObject({ minWidth: 90, maxWidth: 150, minFontSize: 18 });
    expect(resolveCardSettings(local, "B")).toMatchObject({ minWidth: 200, maxWidth: 200, minFontSize: 24 });
  });
  it("rejects scoped edits from a previous grouping even when the same card title exists", () => {
    const scene = createDefaultScene("original");
    const changed = updateSceneTarget(scene, { type: "cards", ids: ["北京市"], scopeGrouping: "city" }, { fontSize: 24 });
    expect(changed).toBe(scene);
  });
});


describe("selected card identity validation", () => {
  it("filters deleted cards and rejects a same-name selection from another grouping", () => {
    const project = createProjectDocument({ students: [{ id: "s1", name: "同学", university: "北京大学", city: "北京市", visibility: true }], templateId: "original", dataView: "province" });
    expect(getSelectedCardIds({ type: "cards", ids: ["北京市", "不存在", "北京市"], scopeGrouping: "province" }, project.cards, project)).toEqual(["北京市"]);
    expect(getSelectedCardIds({ type: "cards", ids: ["北京市"], scopeGrouping: "city" }, project.cards, project)).toEqual([]);
  });
});
