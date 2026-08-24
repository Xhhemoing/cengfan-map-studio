import { describe, expect, it } from "vitest";
import {
  applyCollaborationOperations,
  diffCollaborationDocument,
  isCollaborationOperation,
  rebaseRemoteCollaborationOperations,
  type CollaborationOperation,
} from "./collaboration-operations";

function legacyIsRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function legacySameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (!left || !right || typeof left !== "object") return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

type LegacyIdItem = Record<string, unknown> & { id: string };

function legacyIsIdArray(value: unknown): value is LegacyIdItem[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const element of value) {
    if (!legacyIsRecord(element) || typeof element.id !== "string" || element.id.length === 0) return false;
    if (seen.has(element.id)) return false;
    seen.add(element.id);
  }
  return true;
}

/** Frozen reference implementation used only for differential fuzz coverage. */
function legacyDiffCollaborationDocument(before: unknown, after: unknown): CollaborationOperation[] {
  const operations: CollaborationOperation[] = [];
  const visit = (left: unknown, right: unknown, path: string[]) => {
    if (legacySameValue(left, right)) return;
    if (legacyIsRecord(left) && legacyIsRecord(right)) {
      const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
      for (const key of keys) {
        if (!Object.hasOwn(right, key)) operations.push({ type: "delete", path: [...path, key] });
        else if (!Object.hasOwn(left, key)) {
          operations.push({ type: "set", path: [...path, key], value: structuredClone(right[key]) });
        } else visit(left[key], right[key], [...path, key]);
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)
      && legacyIsIdArray(left) && legacyIsIdArray(right)) {
      const removed = left.filter((item) => !right.some((candidate) => candidate.id === item.id));
      const upserts: CollaborationOperation[] = [];
      for (const item of right) {
        const previous = left.find((candidate) => candidate.id === item.id);
        if (!previous || !legacySameValue(previous, item)) {
          upserts.push({ type: "array-upsert", path, item: structuredClone(item) });
        }
      }
      if (removed.length + upserts.length > 256) {
        operations.push({ type: "set", path, value: structuredClone(right) });
        return;
      }
      for (const item of removed) operations.push({ type: "array-remove", path, itemId: item.id });
      operations.push(...upserts);
      return;
    }
    if (path.length > 0) operations.push({ type: "set", path, value: structuredClone(right) });
  };
  visit(before, after, []);
  return operations;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

type FuzzStudent = {
  id: string;
  name: string;
  destination: { city: string; score: number };
  tags: string[];
};

type FuzzDocument = {
  project: {
    title: string;
    settings: { scale: number; theme: string; subtitle?: string };
  };
  students: FuzzStudent[];
  visibleFields: string[];
};

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
      { students: [{ id: "1", name: "甲" }] },
      { students: [{ id: "1", name: "乙" }, { id: "1", name: "丙" }] },
    )).toEqual([{
      type: "set",
      path: ["students"],
      value: [{ id: "1", name: "乙" }, { id: "1", name: "丙" }],
    }]);
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

  it("terminates safely for circular records and arrays", () => {
    type CircularDocument = { title: string; self?: CircularDocument; list?: unknown[] };
    const before: CircularDocument = { title: "旧" };
    const after: CircularDocument = { title: "新" };
    before.self = before;
    after.self = after;
    before.list = [];
    after.list = [];
    before.list.push(before.list);
    after.list.push(after.list);

    expect(diffCollaborationDocument(before, after)).toEqual([
      { type: "set", path: ["title"], value: "新" },
    ]);
  });

  it("diffs every path to a changed object shared by multiple siblings", () => {
    const beforeShared = { value: "旧" };
    const afterShared = { value: "新" };
    const before = { left: beforeShared, right: beforeShared };
    const after = { left: afterShared, right: afterShared };

    const operations = diffCollaborationDocument(before, after);

    expect(operations).toEqual([
      { type: "set", path: ["left", "value"], value: "新" },
      { type: "set", path: ["right", "value"], value: "新" },
    ]);
    expect(applyCollaborationOperations(before, operations)).toEqual(after);
  });

  it("never emits blocked prototype-related path segments", () => {
    const before = JSON.parse('{"safe":1,"__proto__":{"old":true},"constructor":{"old":true}}') as unknown;
    const after = JSON.parse(
      '{"safe":2,"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}',
    ) as unknown;

    const operations = diffCollaborationDocument(before, after);

    expect(operations).toEqual([{ type: "set", path: ["safe"], value: 2 }]);
    expect(operations.every((operation) => operation.path.every(
      (part) => part !== "__proto__" && part !== "constructor" && part !== "prototype",
    ))).toBe(true);
  });

  it("matches the legacy operation sequence and round-trips 500 seeded id-array documents", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const random = seededRandom(seed);
      const studentCount = 1 + Math.floor(random() * 8);
      const before: FuzzDocument = {
        project: {
          title: `项目 ${seed}`,
          settings: { scale: 0.8 + random(), theme: `主题 ${seed % 4}`, subtitle: `副标题 ${seed}` },
        },
        students: Array.from({ length: studentCount }, (_, index) => ({
          id: `student-${seed}-${index}`,
          name: `同学 ${index}`,
          destination: { city: `城市 ${index % 5}`, score: Math.floor(random() * 100) },
          tags: [`标签 ${index % 3}`, `种子 ${seed % 7}`],
        })),
        visibleFields: ["name", "city"],
      };
      const after = structuredClone(before);

      after.students = after.students.filter(() => random() >= 0.18);
      after.students = after.students.map((student, index) => random() < 0.45
        ? {
            ...student,
            name: `${student.name} 改`,
            destination: { ...student.destination, score: student.destination.score + index + 1 },
          }
        : student);
      const addedCount = Math.floor(random() * 3);
      for (let index = 0; index < addedCount; index += 1) {
        after.students.push({
          id: `added-${seed}-${index}`,
          name: `新增 ${index}`,
          destination: { city: `新城市 ${index}`, score: Math.floor(random() * 100) },
          tags: ["新增"],
        });
      }
      if (random() < 0.5) after.project.title = `${after.project.title} 改`;
      if (random() < 0.33) delete after.project.settings.subtitle;
      if (random() < 0.4) after.visibleFields = [...after.visibleFields, "university"];

      const legacyOperations = legacyDiffCollaborationDocument(before, after);
      const operations = diffCollaborationDocument(before, after);

      expect(operations, `operation mismatch for seed ${seed}`).toEqual(legacyOperations);
      expect(
        applyCollaborationOperations(before, operations),
        `round-trip mismatch for seed ${seed}`,
      ).toEqual(after);
    }
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