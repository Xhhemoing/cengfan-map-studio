import { normalizeScene } from "./scene-document";
import { describe, expect, it } from "vitest";
import { applyTransaction, createProjectDocument, redoTransaction, undoTransaction } from "./project-document";
import type { Student } from "./project-data";
import type { ImportReviewRow } from "./data-workspace";
import { buildImportDiffPlan, createImportDiff, importDiffTransaction, rosterKey, summarizeImportDiff } from "./import-diff";

const old: Student[] = [
  { id: "a", name: "Alex", university: "U1", city: "London", locationScope: "international", visibility: false },
  { id: "b", name: "Sam", university: "U2", city: "Paris", locationScope: "international", visibility: true },
];
const row = (s: Partial<ImportReviewRow> = {}): ImportReviewRow => ({ ...old[0]!, accepted: true, sourceLine: 1, rawLine: "source", ...s });
const initial = (s: ReturnType<typeof createImportDiff>) => s.rows.map((r) => r.initial);

describe("roster diff", () => {
  it("keeps all old identities/order/visibility on repeated and reordered import", () => {
    const s = createImportDiff(old, [row({ ...old[1], sourceLine: 2 }), row()]);
    const p = buildImportDiffPlan(s, initial(s), old);
    expect(p.students).toEqual(old);
    expect(p.summary).toMatchObject({ unchanged: 2, updated: 0, added: 0, retained: 0 });
    const project = createProjectDocument({ students: old, templateId: "original", dataView: "province" });
    expect(applyTransaction(project, importDiffTransaction(p))).toBe(project);
  });
  it("never deletes a record absent from the new table", () => {
    const s = createImportDiff(old, [row()]);
    expect(buildImportDiffPlan(s, initial(s), old).students).toEqual(old);
    expect(summarizeImportDiff(s, initial(s)).retained).toBe(1);
  });
  it("does not turn name-only candidates into updates", () => {
    const s = createImportDiff(old, [row({ city: "Tokyo" })]);
    expect(s.rows[0]!.initial.kind).toBe("pending");
    expect(() => buildImportDiffPlan(s, initial(s), old)).toThrow();
    const p = buildImportDiffPlan(s, [{ kind: "match", studentId: "a" }], old);
    expect(p.students[0]).toEqual({ ...old[0], city: "Tokyo" });
    expect(p.students[1]).toEqual(old[1]);
  });
  it("supports rename through an explicit identity choice", () => {
    const s = createImportDiff(old, [row({ name: "New name" })]);
    const p = buildImportDiffPlan(s, [{ kind: "match", studentId: "a" }], old);
    expect(p.students[0]!.id).toBe("a");
    expect(p.students[0]!.name).toBe("New name");
  });
  it("can explicitly add same-name people without merging them", () => {
    const s = createImportDiff(old, [row({ city: "Tokyo" })]);
    const p = buildImportDiffPlan(s, [{ kind: "add" }], old, () => "new");
    expect(p.students).toHaveLength(3);
    expect(p.students[2]).toMatchObject({ id: "new", visibility: true, city: "Tokyo" });
  });
  it("requires disambiguation for duplicate exact rows, including new people", () => {
    const s = createImportDiff(old, [row(), row({ sourceLine: 2 })]);
    expect(initial(s).every((d) => d.kind === "pending")).toBe(true);
    const empty = createImportDiff([], [row(), row({ sourceLine: 2 })]);
    expect(initial(empty).every((d) => d.kind === "pending")).toBe(true);
    expect(() => buildImportDiffPlan(s, [{ kind: "match", studentId: "a" }, { kind: "match", studentId: "a" }], old)).toThrow();
  });
  it("does not infer identity when the existing roster has identical people", () => {
    const s = createImportDiff([old[0]!, { ...old[0]!, id: "twin" }], [row()]);
    expect(s.rows[0]!.initial.kind).toBe("pending");
  });
  it("rejects missing targets and generated ID collisions", () => {
    const s = createImportDiff(old, [row()]);
    expect(() => buildImportDiffPlan(s, [{ kind: "match", studentId: "missing" }], old)).toThrow();
    expect(() => buildImportDiffPlan(s, [{ kind: "add" }], old, () => "a")).toThrow();
  });
  it("rejects invalid accepted rows, but accounts for excluded rows", () => {
    expect(() => createImportDiff(old, [row({ city: "" })])).toThrow();
    const s = createImportDiff(old, [row(), row({ city: "", accepted: false })]);
    expect(s.excluded).toBe(1);
    expect(s.rows).toHaveLength(1);
    expect(() => createImportDiff(old, [])).toThrow();
  });
  it("invalidates a preview after hidden status, facts or roster order change", () => {
    const s = createImportDiff(old, [row()]);
    for (const current of [[...old].reverse(), [{ ...old[0]!, visibility: true }, old[1]!], [{ ...old[0]!, city: "Tokyo" }, old[1]!]]) {
      expect(() => buildImportDiffPlan(s, initial(s), current)).toThrow();
    }
  });
  it("keeps manual province until the user explicitly clears it", () => {
    const roster = [{ ...old[0]!, province: "manual" }];
    const s = createImportDiff(roster, [row({ city: "Tokyo" })]);
    const keep = buildImportDiffPlan(s, [{ kind: "match", studentId: "a" }], roster);
    expect(keep.students[0]!.province).toBe("manual");
    const clear = buildImportDiffPlan(s, [{ kind: "match", studentId: "a", clearProvince: true }], roster);
    expect(clear.students[0]).not.toHaveProperty("province");
  });
  it("does not leave an international flag when explicitly moving to China", () => {
    const s = createImportDiff(old, [row({ city: "北京", locationScope: "china" })]);
    const p = buildImportDiffPlan(s, [{ kind: "match", studentId: "a" }], old);
    expect(p.students[0]!.locationScope).not.toBe("international");
    expect(p.students[0]!.city).toBe("北京市");
  });
  it("freezes the source and plan against later reference mutations", () => {
    const roster = old.map((s) => ({ ...s }));
    const input = [row({ city: "Tokyo" })];
    const s = createImportDiff(roster, input);
    input[0]!.city = "Berlin";
    expect(s.rows[0]!.facts.city).toBe("Tokyo");
    const p = buildImportDiffPlan(s, [{ kind: "match", studentId: "a" }], roster);
    const tx = importDiffTransaction(p);
    p.students[0]!.city = "Berlin";
    const project = createProjectDocument({ students: roster, templateId: "original", dataView: "province" });
    expect(applyTransaction(project, tx).students[0]!.city).toBe("Tokyo");
  });
  it("applies one undoable transaction without changing scene/manual card positions", () => {
    const project = createProjectDocument({ students: old, templateId: "original", dataView: "province" });
    project.cards.positions = { test: { x: 12, y: 34 } };
    const s = createImportDiff(old, [row({ city: "Tokyo" }), row({ ...old[1], sourceLine: 2 })]);
    const p = buildImportDiffPlan(s, [{ kind: "match", studentId: "a" }, { kind: "match", studentId: "b" }], old);
    const next = applyTransaction(project, importDiffTransaction(p));
    expect(next.cards).toEqual(normalizeScene(project).cards);
    expect(next.style).toEqual(project.style);
    expect(next.history.past).toHaveLength(1);
    expect(undoTransaction(next).students).toEqual(old);
    expect(redoTransaction(undoTransaction(next)).students).toEqual(p.students);
    expect(applyTransaction(next, importDiffTransaction(p))).toBe(next);
  });
  it.each([30, 60, 100, 200])("updates exactly three of %i synthetic records", (count) => {
    const roster = Array.from({ length: count }, (_, i) => ({ ...old[0]!, id: `id-${i}`, name: `Person ${i}` }));
    const input = roster.map((s, i) => row({ ...s, city: i < 3 ? "Tokyo" : s.city, sourceLine: i + 1 }));
    const s = createImportDiff(roster, input);
    const decisions = s.rows.map((r, i) => i < 3 ? { kind: "match" as const, studentId: roster[i]!.id } : r.initial);
    const p = buildImportDiffPlan(s, decisions, roster);
    expect(p.summary).toMatchObject({ updated: 3, added: 0, unchanged: count - 3 });
    expect(rosterKey(p.students.slice(3))).toBe(rosterKey(roster.slice(3)));
  });
});
