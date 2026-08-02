export type CollaborationPath = string[];

export type CollaborationOperation =
  | { type: "set"; path: CollaborationPath; value: unknown }
  | { type: "delete"; path: CollaborationPath };

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
  return value.type === "delete" || (value.type === "set" && Object.hasOwn(value, "value"));
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
    if (path.length > 0) operations.push({ type: "set", path, value: structuredClone(right) });
  };

  visit(before, after, []);
  return operations;
}

function applyOperation(current: unknown, operation: CollaborationOperation, depth = 0): unknown {
  const key = operation.path[depth]!;
  const source = isRecord(current) ? current : {};
  const next: Record<string, unknown> = { ...source };
  if (depth === operation.path.length - 1) {
    if (operation.type === "delete") delete next[key];
    else next[key] = structuredClone(operation.value);
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
