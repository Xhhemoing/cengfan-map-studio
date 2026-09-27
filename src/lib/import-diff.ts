import type { ImportReviewRow } from "./data-workspace";
import type { Student } from "./project-data";
import type { ProjectTransaction } from "./project-document";
import { createId } from "./ids";
import { normalizeCityName, validateStudentInput } from "./student-data";

export type ImportDecision =
  | { kind: "pending" | "add" | "skip" }
  | { kind: "match"; studentId: string; clearProvince?: boolean };
export type ImportFacts = Pick<Student, "name" | "university" | "city" | "locationScope">;
export interface ImportDiffRow {
  facts: ImportFacts;
  sourceLine: number;
  suggestedIds: string[];
  initial: ImportDecision;
}
export interface ImportDiffSession {
  baseKey: string;
  sourceKey: string;
  students: Student[];
  rows: ImportDiffRow[];
  excluded: number;
}
export interface ImportDiffSummary {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  retained: number;
  errors: string[];
}
export interface ImportDiffPlan {
  baseKey: string;
  students: Student[];
  summary: ImportDiffSummary;
}
export type ApplyImportDiff = (plan: ImportDiffPlan) => "applied" | "unchanged" | "stale" | "readonly";

/** Exact, ordered, explicit-field keys: no hash collisions or mutable references. */
export function rosterKey(students: readonly Student[]): string {
  return JSON.stringify(students.map((s) => [s.id, s.name, s.university, s.city, s.province ?? "", s.locationScope ?? "", s.visibility]));
}
export function importSourceKey(rows: readonly ImportReviewRow[]): string {
  return JSON.stringify(rows.map((r) => [r.name, r.university, r.city, r.locationScope ?? "", r.sourceLine, r.rawLine, r.accepted]));
}
function normalizeFacts(s: ImportFacts): ImportFacts {
  return {
    name: s.name.trim(), university: s.university.trim(),
    city: s.locationScope === "international" ? s.city.trim() : normalizeCityName(s.city.trim()),
    ...(s.locationScope === "international" ? { locationScope: "international" as const } : {}),
  };
}
function factKey(s: ImportFacts): string {
  const n = normalizeFacts(s);
  return JSON.stringify([n.name, n.university, n.city, n.locationScope ?? "china"]);
}
function assertUniqueIds(students: readonly Student[]): void {
  const ids = new Set(students.map((s) => s.id));
  if (ids.has("") || ids.size !== students.length) throw new Error("名单记录 ID 不唯一，请先检查工程");
}

export function createImportDiff(students: Student[], source: ImportReviewRow[]): ImportDiffSession {
  assertUniqueIds(students);
  const accepted = source.filter((r) => r.accepted);
  if (!accepted.length) throw new Error("请先勾选至少一条有效候选");
  for (const row of accepted) {
    const errors = validateStudentInput(row).filter((i) => i.level === "error");
    if (errors.length) throw new Error(`第 ${row.sourceLine} 行：${errors.map((e) => e.message).join("；")}。请修正或取消勾选后重新比较`);
  }
  const keys = accepted.map(factKey);
  const existing = students.map(factKey);
  return {
    baseKey: rosterKey(students), sourceKey: importSourceKey(source),
    students: students.map((s) => ({ ...s })), excluded: source.length - accepted.length,
    rows: accepted.map((row, index) => {
      const facts = normalizeFacts(row);
      const exact = students.filter((_, i) => existing[i] === keys[index]);
      const repeated = keys.filter((key) => key === keys[index]).length > 1;
      const suggested = students.filter((s) => s.name.trim() === facts.name
        || (s.university.trim() === facts.university && normalizeFacts(s).city === facts.city));
      const initial: ImportDecision = exact.length === 1 && !repeated
        ? { kind: "match", studentId: exact[0]!.id }
        : { kind: exact.length || suggested.length || repeated ? "pending" : "add" };
      return { facts, sourceLine: row.sourceLine, suggestedIds: suggested.map((s) => s.id), initial };
    }),
  };
}

export function applyImportFacts(student: Student, facts: ImportFacts, clearProvince = false): Student {
  // An unchanged row must not normalize away explicit scope or manual metadata.
  if (factKey(student) === factKey(facts) && !clearProvince) return student;
  const next = { ...student, ...facts };
  if (facts.locationScope !== "international" && next.locationScope === "international") delete next.locationScope;
  if (clearProvince) delete next.province;
  return next;
}

export function summarizeImportDiff(session: ImportDiffSession, decisions: ImportDecision[]): ImportDiffSummary {
  const summary: ImportDiffSummary = { added: 0, updated: 0, unchanged: 0, skipped: 0, retained: 0, errors: [] };
  const seen = new Set<string>();
  session.rows.forEach((row, index) => {
    const d = decisions[index];
    if (!d || d.kind === "pending") {
      summary.errors.push(`第 ${row.sourceLine} 行仍需确认匹配`);
    } else if (d.kind === "add") summary.added += 1;
    else if (d.kind === "skip") summary.skipped += 1;
    else if (d.kind === "match") {
      const old = session.students.find((s) => s.id === d.studentId);
      if (!old || seen.has(d.studentId)) {
        summary.errors.push(`第 ${row.sourceLine} 行匹配无效，或多行指向同一旧记录`);
        return;
      }
      seen.add(d.studentId);
      const changed = rosterKey([old]) !== rosterKey([applyImportFacts(old, row.facts, d.clearProvince)]);
      if (changed) summary.updated += 1;
      else summary.unchanged += 1;
    } else summary.errors.push("无效的匹配选择");
  });
  if (decisions.length !== session.rows.length) summary.errors.push("候选数量已改变，请重新比较");
  summary.retained = session.students.length - seen.size;
  return summary;
}

export function buildImportDiffPlan(
  session: ImportDiffSession, decisions: ImportDecision[], current: Student[], newId = () => createId("student"),
): ImportDiffPlan {
  if (rosterKey(current) !== session.baseKey) throw new Error("名单已改变，请重新比较");
  const summary = summarizeImportDiff(session, decisions);
  if (summary.errors.length) throw new Error(summary.errors.join("；"));
  const updates = new Map<string, Student>();
  const additions: Student[] = [];
  session.rows.forEach((row, index) => {
    const d = decisions[index]!;
    if (d.kind === "add") additions.push({ ...row.facts, id: newId(), visibility: true });
    if (d.kind === "match") updates.set(d.studentId, applyImportFacts(session.students.find((s) => s.id === d.studentId)!, row.facts, d.clearProvince));
  });
  const students = [...current.map((s) => ({ ...(updates.get(s.id) ?? s) })), ...additions];
  assertUniqueIds(students);
  return { baseKey: session.baseKey, students, summary };
}

/** Guard again at the actual transaction boundary; rejection creates no history. */
export function importDiffTransaction(plan: ImportDiffPlan): ProjectTransaction {
  const records = plan.students.map((s) => ({ ...s }));
  const baseKey = plan.baseKey;
  assertUniqueIds(records);
  return {
    id: createId("tx-import-diff"), label: "比较并更新名单", source: "import",
    apply: (current) => rosterKey(current.students) !== baseKey || rosterKey(records) === baseKey
      ? current : { ...current, students: records.map((s) => ({ ...s })) },
  };
}
