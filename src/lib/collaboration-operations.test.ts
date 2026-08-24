import { describe, expect, it } from "vitest";
import { applyCollaborationOperations, diffCollaborationDocument, isCollaborationOperation, rebaseRemoteCollaborationOperations } from "./collaboration-operations";

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

  it("diffs id-qualified object arrays into per-element semantic operations", () => {
    const before = { students: [{ id: "1", name: "甲" }, { id: "2", name: "乙" }] };
    const after = { students: [{ id: "1", name: "甲改" }, { id: "3", name: "丙" }] };

    expect(diffCollaborationDocument(before, after)).toEqual([
      { type: "array-remove", path: ["students"], itemId: "2" },
      { type: "array-upsert", path: ["students"], item: { id: "1", name: "甲改" } },
      { type: "array-upsert", path: ["students"], item: { id: "3", name: "丙" } },
    ]);
  });

  it("keeps arrays without unique non-empty string ids as atomic set operations", () => {
    expect(diffCollaborationDocument({ visibleFields: ["name", "city"] }, { visibleFields: ["name"] })).toEqual([
      { type: "set", path: ["visibleFields"], value: ["name"] },
    ]);
    expect(diffCollaborationDocument(
      { students: [{ id: "1", name: "甲" }, { id: "1", name: "乙" }] },
      { students: [{ id: "1", name: "丙" }] },
    )).toEqual([{ type: "set", path: ["students"], value: [{ id: "1", name: "丙" }] }]);
    expect(diffCollaborationDocument(
      { students: [{ name: "无 id" }] },
      { students: [{ name: "仍无 id" }] },
    )).toEqual([{ type: "set", path: ["students"], value: [{ name: "仍无 id" }] }]);
    expect(diffCollaborationDocument(
      { students: [{ id: "1", name: "甲" }] },
      { students: "not-an-array" },
    )).toEqual([{ type: "set", path: ["students"], value: "not-an-array" }]);
  });

  it("applies array-upsert and array-remove without touching sibling elements", () => {
    const current = { students: [{ id: "1", name: "甲" }, { id: "2", name: "乙" }] };
    const next = applyCollaborationOperations(current, [
      { type: "array-upsert", path: ["students"], item: { id: "2", name: "乙改" } },
      { type: "array-upsert", path: ["students"], item: { id: "3", name: "丙" } },
      { type: "array-remove", path: ["students"], itemId: "1" },
    ]);

    expect(next).toEqual({ students: [{ id: "2", name: "乙改" }, { id: "3", name: "丙" }] });
    expect(next).not.toBe(current);
    expect(next.students).not.toBe(current.students);
    expect(next.students[0]).not.toBe(current.students[1]);
    expect(current.students).toEqual([{ id: "1", name: "甲" }, { id: "2", name: "乙" }]);
  });

  it("rejects malformed semantic operations and accepts valid ones", () => {
    expect(isCollaborationOperation({ type: "array-upsert", path: ["students"], item: { name: "缺 id" } })).toBe(false);
    expect(isCollaborationOperation({ type: "array-upsert", path: ["students"], item: { id: "", name: "空 id" } })).toBe(false);
    expect(isCollaborationOperation({ type: "array-upsert", path: ["students"], item: { id: 7 } })).toBe(false);
    expect(isCollaborationOperation({ type: "array-upsert", path: ["students"], item: "not-an-object" })).toBe(false);
    expect(isCollaborationOperation({ type: "array-remove", path: ["students"], itemId: "" })).toBe(false);
    expect(isCollaborationOperation({ type: "array-remove", path: ["__proto__"], itemId: "1" })).toBe(false);
    expect(isCollaborationOperation({ type: "array-remove", path: ["students"], itemId: "1", extra: true })).toBe(false);

    expect(isCollaborationOperation({ type: "array-upsert", path: ["students"], item: { id: "1", name: "甲" } })).toBe(true);
    expect(isCollaborationOperation({ type: "array-remove", path: ["students"], itemId: "1" })).toBe(true);
  });

  it("falls back to one atomic set when semantic operations would exceed the operation cap", () => {
    const before = { students: Array.from({ length: 260 }, (_, index) => ({ id: `s${index}`, name: `n${index}` })) };
    const after = { students: before.students.map((student) => ({ ...student, name: `${student.name}!` })) };

    expect(diffCollaborationDocument(before, after)).toEqual([
      { type: "set", path: ["students"], value: after.students },
    ]);
  });

  it("emits no ghost operations when values match but object key order differs", () => {
    const baseline = {
      students: [{ id: "s1", name: "甲", city: "北京" }],
      meta: { title: "同", scale: 1 },
    };
    const restored = {
      students: [{ city: "北京", id: "s1", name: "甲" }],
      meta: { scale: 1, title: "同" },
    };

    expect(diffCollaborationDocument(baseline, restored)).toEqual([]);
  });

  it("ignores undefined-valued keys like JSON serialization when diffing", () => {
    const withUndefined = { project: { title: "同", fontId: undefined } };
    const withoutKey = { project: { title: "同" } };

    expect(diffCollaborationDocument(withUndefined, withoutKey)).toEqual([]);
    expect(diffCollaborationDocument(withoutKey, withUndefined)).toEqual([]);
  });

  it("does not resurrect a remotely removed item through key-order ghost upserts on rebase", () => {
    // baseline 保留发送方的键序；本端经 restore 后仅键序不同。
    const baseline = {
      students: [{ id: "s1", name: "甲", city: "北京" }, { id: "s2", name: "乙", city: "上海" }],
    };
    const current = {
      students: [{ city: "北京", id: "s1", name: "甲" }, { city: "上海", id: "s2", name: "乙" }],
    };
    const remote = [{ type: "array-remove" as const, path: ["students"], itemId: "s1" }];

    const rebased = rebaseRemoteCollaborationOperations(baseline, current, remote);
    expect(rebased.baseline.students.map((student) => student.id)).toEqual(["s2"]);
    expect(rebased.current.students.map((student) => student.id)).toEqual(["s2"]);

    // 成员随后编辑无关项，不得把被删学生回传复活。
    const edited = { students: [{ city: "上海", id: "s2", name: "乙改" }] };
    expect(diffCollaborationDocument(rebased.baseline, edited)).toEqual([
      { type: "array-upsert", path: ["students"], item: { city: "上海", id: "s2", name: "乙改" } },
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