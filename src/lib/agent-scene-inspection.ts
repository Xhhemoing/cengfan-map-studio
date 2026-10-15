import type { ProjectDocument } from "./project-document";
import { buildProjectDigest, fingerprintProject } from "./project-digest";
import { SCENE_CAPABILITIES, type SceneDomain } from "./scene-capabilities";

export function safeAgentValue(value: unknown, key = "value", depth = 0): unknown {
  if (depth > 16) return "<nested-value>";
  if (typeof value === "string" && value.startsWith("data:")) return `<asset:${key}>`;
  if (Array.isArray(value)) return value.map((item, index) => safeAgentValue(item, `${key}.${index}`, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([name]) => !["__proto__", "prototype", "constructor"].includes(name)).map(([name, item]) => [name, safeAgentValue(item, `${key}.${name}`, depth + 1)]));
  return value ?? null;
}
export function readOwnPath(value: unknown, path: string): unknown {
  let current = value;
  for (const token of path.match(/[^.[\]]+/g) ?? []) {
    if (["__proto__", "prototype", "constructor"].includes(token) || !current || typeof current !== "object" || !Object.hasOwn(current, token)) return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}
/** Query complete scene properties, with binary references and roster rows excluded. */
export function inspectProjectValue(project: ProjectDocument, path: string): Record<string, unknown> {
  const projection = { canvas: project.canvas, map: project.map, cards: project.cards, guests: { ...project.guests, people: undefined, peopleCount: project.guests.people.length }, textElements: project.textElements, assetElements: project.assetElements, students: buildProjectDigest(project).students, dataView: project.dataView, templateId: project.templateId };
  const value = readOwnPath(projection, path);
  if (value === undefined) return { ok: false, code: "NOT_AVAILABLE", path, message: "此路径没有可读取的当前值。请查询已有对象/属性；缺失不等于零或默认值。", revision: fingerprintProject(project) };
  const domain = path.split(".")[0] as SceneDomain;
  const property = path.split(".")[1];
  return { ok: true, path, value: safeAgentValue(value, path), valueType: Array.isArray(value) ? "array" : typeof value, schema: property ? SCENE_CAPABILITIES[domain]?.[property] : undefined, revision: fingerprintProject(project) };
}
export interface AgentValueDiff { path: string; before: unknown; after: unknown; requested?: unknown; normalized: boolean }
// Optional empty collections all mean inherited/default styling, not an observable edit.
const empty = (value: unknown) => value == null || typeof value === "object" && Object.keys(value).length === 0;
const equal = (left: unknown, right: unknown) => empty(left) && empty(right) || JSON.stringify(left) === JSON.stringify(right);
export function describeActualPatch(before: Record<string, unknown>, after: Record<string, unknown>, patch: Record<string, unknown>, prefix: string): AgentValueDiff[] {
  const requestedDiff = Object.entries(patch).flatMap(([key, requested]) => {
    const path = `${prefix}.${key}`;
    if (requested && typeof requested === "object" && !Array.isArray(requested)) {
      return describeActualPatch((before[key] ?? {}) as Record<string, unknown>, (after[key] ?? {}) as Record<string, unknown>, requested as Record<string, unknown>, path);
    }
    return [{ path, before: safeAgentValue(before[key], path), after: safeAgentValue(after[key], path), requested: safeAgentValue(requested, path), normalized: !equal(requested, after[key]) }];
  });
  const implicitDiff = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => !Object.hasOwn(patch, key) && !equal(before[key], after[key])).map(key => ({ path: `${prefix}.${key}`, before: safeAgentValue(before[key], key), after: safeAgentValue(after[key], key), normalized: false }));
  return [...requestedDiff, ...implicitDiff];
}
export interface AgentPatchFeedback { diff: AgentValueDiff[]; noop: boolean; normalized: string[]; revision: string }
export function patchFeedback(project: ProjectDocument, diff: AgentValueDiff[]): AgentPatchFeedback {
  return { diff, noop: diff.every(item => equal(item.before, item.after)), normalized: diff.filter(item => item.normalized).map(item => item.path), revision: fingerprintProject(project) };
}
