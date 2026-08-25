// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * File-size ratchet.
 *
 * Three rounds of splits shrank the worst files in this repo, and nothing stopped the
 * next 1500-line module or test from landing. This guard walks every tracked source file
 * and fails anything over {@link MAX_LINES} unless `scripts/file-size-allowlist.json`
 * records it at its current size.
 *
 * The allowlist is a ratchet, not an exemption list:
 *   - a new file over the limit fails until someone splits it (adding an entry is a
 *     reviewable, deliberate act, not a drive-by);
 *   - an allowlisted file that grows fails;
 *   - an allowlisted file that shrinks also fails, so the recorded count is lowered in the
 *     same commit that shrinks the file and can never drift back up.
 *
 * Queued follow-up tasks that split an allowlisted file (`server/index.ts`, `src/App.tsx`,
 * the big canvas and collaboration tests, ...) update or delete their own entry in
 * `file-size-allowlist.json` as part of that split. They rebase onto this file; they do not
 * rewrite the logic below to make room for themselves.
 */

/** Maximum line count for a tracked source file, per AGENTS.md ("文件超过 400 行拆分"). */
const MAX_LINES = 400;

/** Extensions the ratchet governs: hand-written source, tests, and styles. */
const TRACKED_GLOBS = ["*.ts", "*.tsx", "*.css", "*.mjs"] as const;

/** Tool output and caches that happen to be tracked but are never hand-edited. */
const IGNORED_PREFIXES = ["graphify-out/", "node_modules/", "dist/"] as const;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = "scripts/file-size-allowlist.json";

type Allowlist = Record<string, number>;

function readAllowlist(): Allowlist {
  const raw = readFileSync(resolve(repoRoot, allowlistPath), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${allowlistPath} must be a JSON object of "path": lineCount entries`);
  }
  return parsed as Allowlist;
}

function listTrackedFiles(): string[] {
  const stdout = execFileSync("git", ["ls-files", "-z", "--", ...TRACKED_GLOBS], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout
    .split("\0")
    .filter((path) => path.length > 0)
    .filter((path) => !IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .sort();
}

/** Newline count, matching `wc -l` so the numbers in the allowlist are reproducible by hand. */
function countLines(path: string): number {
  const text = readFileSync(resolve(repoRoot, path), "utf8");
  let lines = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lines += 1;
  }
  return lines;
}

function measureTrackedFiles(): Map<string, number> {
  const measured = new Map<string, number>();
  for (const path of listTrackedFiles()) {
    measured.set(path, countLines(path));
  }
  return measured;
}

function formatList(lines: string[]): string {
  return lines.map((line) => `  - ${line}`).join("\n");
}

describe("file size ratchet", () => {
  const allowlist = readAllowlist();
  const measured = measureTrackedFiles();

  it("tracks a non-empty set of source files", () => {
    // Guards against a broken glob or a `git ls-files` failure silently passing everything.
    expect(measured.size).toBeGreaterThan(100);
  });

  it("keeps every tracked source file at or below the line limit", () => {
    const offenders: string[] = [];
    for (const [path, lines] of measured) {
      if (lines <= MAX_LINES) continue;
      const recorded = allowlist[path];
      if (typeof recorded === "number" && lines <= recorded) continue;
      offenders.push(`${path}: ${lines} lines (limit ${MAX_LINES})`);
    }

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : [
            `${offenders.length} file(s) exceed ${MAX_LINES} lines and are not covered by ${allowlistPath}:`,
            formatList(offenders),
            "",
            "Split the file. The allowlist only records debt that predates this guard;",
            "adding a new entry needs an explicit reviewer decision.",
          ].join("\n"),
    ).toEqual([]);
  });

  it("fails allowlisted files that grow past their recorded line count", () => {
    const grown: string[] = [];
    for (const [path, recorded] of Object.entries(allowlist)) {
      const lines = measured.get(path);
      if (lines === undefined) continue;
      if (lines > recorded) {
        grown.push(`${path}: ${lines} lines, allowlisted at ${recorded} (+${lines - recorded})`);
      }
    }

    expect(
      grown,
      grown.length === 0
        ? ""
        : [
            `${grown.length} allowlisted file(s) grew:`,
            formatList(grown),
            "",
            "Allowlisted counts only ratchet down. Move the new code elsewhere.",
          ].join("\n"),
    ).toEqual([]);
  });

  it("requires shrinking files to lower their allowlist entry in the same commit", () => {
    const stale: string[] = [];
    for (const [path, recorded] of Object.entries(allowlist)) {
      const lines = measured.get(path);
      if (lines === undefined) {
        stale.push(`${path}: no longer tracked — delete this entry`);
        continue;
      }
      if (lines <= MAX_LINES) {
        stale.push(`${path}: now ${lines} lines, at or under the limit — delete this entry`);
        continue;
      }
      if (lines < recorded) {
        stale.push(`${path}: now ${lines} lines, allowlisted at ${recorded} — set the entry to ${lines}`);
      }
    }

    expect(
      stale,
      stale.length === 0
        ? ""
        : [
            `${stale.length} allowlist entry/entries are stale in ${allowlistPath}:`,
            formatList(stale),
            "",
            "The ratchet only holds if shrinking a file lowers its recorded count in the same commit.",
          ].join("\n"),
    ).toEqual([]);
  });

  it("records allowlist entries as line counts above the limit", () => {
    const malformed: string[] = [];
    for (const [path, recorded] of Object.entries(allowlist)) {
      if (!Number.isInteger(recorded) || recorded <= MAX_LINES) {
        malformed.push(`${path}: ${JSON.stringify(recorded)} is not an integer above ${MAX_LINES}`);
      }
    }
    expect(malformed).toEqual([]);
  });
});
