import { describe, expect, it, vi } from "vitest";
import { createEditorStudentActions } from "./editor-student-actions";
import { buildImportDiffPlan, createImportDiff } from "./import-diff";
import { applyTransaction, createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";

describe("guarded roster event commit", () => {
  it("refuses a concurrently stale proposal at the actual write boundary", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const s = createImportDiff(project.students, [{ ...sampleStudents[0]!, city: "杭州", sourceLine: 1, rawLine: "synthetic", accepted: true }]);
    const plan = buildImportDiffPlan(s, [{ kind: "match", studentId: sampleStudents[0]!.id }], project.students);
    const concurrent = { ...project, students: project.students.slice(1) };
    let result = concurrent;
    const actions = createEditorStudentActions({ students: project.students, canEdit: true, commit: (tx) => { result = applyTransaction(concurrent, tx); } });
    expect(actions.onApplyImportDiff(plan)).toBe("stale");
    expect(result).toBe(concurrent);
    expect(result.history.past).toHaveLength(0);
  });
  it("does not call the write path for a readonly editor", () => {
    const commit = vi.fn();
    const actions = createEditorStudentActions({ students: [], canEdit: false, commit });
    expect(actions.onApplyImportDiff({ baseKey: "[]", students: [], summary: { added: 0, updated: 0, unchanged: 0, skipped: 0, retained: 0, errors: [] } })).toBe("readonly");
    expect(commit).not.toHaveBeenCalled();
  });
});
