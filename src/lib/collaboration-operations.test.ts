import { describe, expect, it } from "vitest";
import { applyCollaborationOperations, diffCollaborationDocument, rebaseRemoteCollaborationOperations } from "./collaboration-operations";

describe("collaboration operations", () => {
  it("creates narrow set and delete operations for changed object fields", () => {
    const before = { project: { title: "旧", map: { scale: 1, color: "blue" } }, assets: [] };
    const after = { project: { title: "新", map: { scale: 1 } }, assets: [] };

    expect(diffCollaborationDocument(before, after)).toEqual([
      { type: "delete", path: ["project", "map", "color"] },
      { type: "set", path: ["project", "title"], value: "新" },
    ]);
  });

  it("applies operations immutably and blocks prototype-pollution paths", () => {
    const current = { project: { map: { scale: 1 } }, assets: ["keep"] };
    const next = applyCollaborationOperations(current, [
      { type: "set", path: ["project", "map", "scale"], value: 1.2 },
      { type: "set", path: ["__proto__", "polluted"], value: true },
    ]);

    expect(next).toEqual({ project: { map: { scale: 1.2 } }, assets: ["keep"] });
    expect(next).not.toBe(current);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("treats arrays as atomic values to keep indices stable across clients", () => {
    expect(diffCollaborationDocument({ students: [{ id: "1", name: "甲" }] }, { students: [{ id: "1", name: "乙" }] })).toEqual([
      { type: "set", path: ["students"], value: [{ id: "1", name: "乙" }] },
    ]);
  });

  it("preserves pending local fields while rebasing a remote incremental update", () => {
    const baseline = { project: { title: "初始", map: { scale: 1 } } };
    const local = { project: { title: "本地未上传", map: { scale: 1 } } };
    const remote = [{ type: "set" as const, path: ["project", "map", "scale"], value: 1.2 }];

    expect(rebaseRemoteCollaborationOperations(baseline, local, remote)).toEqual({
      baseline: { project: { title: "初始", map: { scale: 1.2 } } },
      current: { project: { title: "本地未上传", map: { scale: 1.2 } } },
    });
  });
});