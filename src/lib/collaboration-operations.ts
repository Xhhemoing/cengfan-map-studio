export type CollaborationPath = string[];

export type CollaborationOperation =
  | { type: "set"; path: CollaborationPath; value: unknown }
  | { type: "delete"; path: CollaborationPath }
  | { type: "array-upsert"; path: CollaborationPath; item: Record<string, unknown> }
  | { type: "array-remove"; path: CollaborationPath; itemId: string };

const BLOCKED_PATH_PARTS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_PATH_DEPTH = 16;
const MAX_OPERATIONS = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSafeCollaborationPath(path: unknown): path is CollaborationPath {
  return Array.isArray(path)
    && path.length > 0
    && path.length <= MAX_PATH_DEPTH
    && path.every((part) => typeof part === "string" && part.length > 0 && !BLOCKED_PATH_PARTS.has(part));
}

export function isCollaborationOperation(value: unknown): value is CollaborationOperation {
  if (!isRecord(value) || !isSafeCollaborationPath(value.path)) return false;
  if (value.type === "delete") return Object.keys(value).length === 2;
  if (value.type === "set") return Object.keys(value).length === 3 && Object.hasOwn(value, "value");
  if (value.type === "array-upsert") {
    return Object.keys(value).length === 3
      && isRecord(value.item)
      && typeof value.item.id === "string"
      && value.item.id.length > 0;
  }
  if (value.type === "array-remove") {
    return Object.keys(value).length === 3
      && typeof value.itemId === "string"
      && value.itemId.length > 0;
  }
  return false;
}

export function areValidCollaborationOperations(value: unknown): value is CollaborationOperation[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= MAX_OPERATIONS
    && value.every(isCollaborationOperation);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (!left || !right || typeof left !== "object") return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/** 数组元素：普通对象且带非空字符串 id。 */
type IdQualifiedItem = Record<string, unknown> & { id: string };

/** 数组是否由唯一、非空字符串 id 的普通对象构成。 */
function isIdQualifiedObjectArray(value: unknown): value is IdQualifiedItem[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const element of value) {
    if (!isRecord(element)) return false;
    if (typeof element.id !== "string" || element.id.length === 0) return false;
    if (seen.has(element.id)) return false;
    seen.add(element.id);
  }
  return true;
}

export function diffCollaborationDocument(before: unknown, after: unknown): CollaborationOperation[] {
  const operations: CollaborationOperation[] = [];

  const visit = (left: unknown, right: unknown, path: string[]) => {
    if (sameValue(left, right)) return;
    if (isRecord(left) && isRecord(right)) {
      const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
      for (const key of keys) {
        if (!Object.hasOwn(right, key)) {
          operations.push({ type: "delete", path: [...path, key] });
        } else if (!Object.hasOwn(left, key)) {
          operations.push({ type: "set", path: [...path, key], value: structuredClone(right[key]) });
        } else {
          visit(left[key], right[key], [...path, key]);
        }
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)
      && isIdQualifiedObjectArray(left) && isIdQualifiedObjectArray(right)) {
      const removed = left.filter((item) => !right.some((candidate) => candidate.id === item.id));
      const upserts: CollaborationOperation[] = [];
      for (const item of right) {
        const previous = left.find((candidate) => candidate.id === item.id);
        if (!previous || !sameValue(previous, item)) {
          upserts.push({ type: "array-upsert", path, item: structuredClone(item) });
        }
      }
      if (removed.length + upserts.length > MAX_OPERATIONS) {
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

function applyArrayUpsert(current: unknown, item: Record<string, unknown>): unknown {
  const source = Array.isArray(current) ? current : [];
  const index = source.findIndex((element) => isRecord(element) && element.id === item.id);
  if (index === -1) return [...source, structuredClone(item)];
  const next = [...source];
  next[index] = structuredClone(item);
  return next;
}

function applyArrayRemove(current: unknown, itemId: string): unknown {
  if (!Array.isArray(current)) return current;
  const next = current.filter((element) => !(isRecord(element) && element.id === itemId));
  return next.length === current.length ? current : next;
}

function applyOperation(current: unknown, operation: CollaborationOperation, depth = 0): unknown {
  const key = operation.path[depth]!;
  const source = isRecord(current) ? current : {};
  const next: Record<string, unknown> = { ...source };
  if (depth === operation.path.length - 1) {
    if (operation.type === "delete") delete next[key];
    else if (operation.type === "set") next[key] = structuredClone(operation.value);
    else if (operation.type === "array-upsert") next[key] = applyArrayUpsert(source[key], operation.item);
    else next[key] = applyArrayRemove(source[key], operation.itemId);
    return next;
  }
  next[key] = applyOperation(source[key], operation, depth + 1);
  return next;
}

export function applyCollaborationOperations<T>(document: T, operations: readonly CollaborationOperation[]): T {
  let next: unknown = document;
  for (const operation of operations) {
    if (!isCollaborationOperation(operation)) continue;
    next = applyOperation(next, operation);
  }
  return next as T;
}

export function collaborationPathsOverlap(left: CollaborationPath, right: CollaborationPath): boolean {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameCollaborationPath(left: CollaborationPath, right: CollaborationPath): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

/**
 * 操作级冲突判定：
 * - 两个语义操作（array-upsert / array-remove）：仅当指向同一集合路径且作用于同一元素 id 时冲突；
 *   同集合不同 id 可并发重放。
 * - 其余组合（含语义操作与 set / delete 之间）：沿用既有路径前缀重叠语义。
 */
export function collaborationOperationsOverlap(left: CollaborationOperation, right: CollaborationOperation): boolean {
  const leftSemantic = left.type === "array-upsert" || left.type === "array-remove";
  const rightSemantic = right.type === "array-upsert" || right.type === "array-remove";
  if (leftSemantic && rightSemantic) {
    if (!sameCollaborationPath(left.path, right.path)) return false;
    const leftId = left.type === "array-upsert" ? left.item.id : left.itemId;
    const rightId = right.type === "array-upsert" ? right.item.id : right.itemId;
    return leftId === rightId;
  }
  return collaborationPathsOverlap(left.path, right.path);
}

export function rebaseRemoteCollaborationOperations<T>(
  baseline: T,
  current: T,
  remoteOperations: readonly CollaborationOperation[],
): { baseline: T; current: T } {
  const pendingLocalOperations = diffCollaborationDocument(baseline, current);
  const nextBaseline = applyCollaborationOperations(baseline, remoteOperations);
  return {
    baseline: nextBaseline,
    current: applyCollaborationOperations(nextBaseline, pendingLocalOperations),
  };
}
