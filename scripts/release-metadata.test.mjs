import assert from "node:assert/strict";
import { test } from "node:test";
import { planRelease, validateVersion } from "./release-metadata.mjs";

function fixture() {
  return {
    version: "0.1.3",
    manifest: { name: "fixture", version: "0.1.2", private: true, engines: { node: ">=22.13.0 <23" } },
    lock: { version: "0.1.2", packages: { "": { version: "0.1.2" }, "node_modules/example": { version: "1.0.0", integrity: "unchanged" } } },
    feedback: 'export const APP_VERSION = "0.1.2";\nexport const OTHER = true;\n',
    changelog: "## [0.1.3] - 2026-09-29\n",
    notes: "# v0.1.3 Open-source maintenance\n",
  };
}

test("synchronizes all version surfaces without mutating dependencies or input", () => {
  const input = fixture();
  const original = structuredClone(input);
  const result = planRelease(input);
  assert.equal(result.manifest.version, "0.1.3");
  assert.equal(result.lock.version, "0.1.3");
  assert.equal(result.lock.packages[""].version, "0.1.3");
  assert.deepEqual(result.lock.packages[""].engines, input.manifest.engines);
  assert.deepEqual(result.lock.packages["node_modules/example"], input.lock.packages["node_modules/example"]);
  assert.equal(result.manifest.private, true);
  assert.equal(result.feedback, input.feedback.replace('"0.1.2"', '"0.1.3"'));
  assert.deepEqual(input, original);
});

test("rejects invalid, prerelease, traversal, and shell-like versions", () => {
  for (const version of [undefined, "", "v0.1.3", "01.1.3", "1.2", "1.2.3-rc.1", "../notes", "1.2.3;echo bad", "1.2.3\n"]) {
    assert.throws(() => validateVersion(version));
  }
});

test("rejects downgrade using numeric rather than lexical ordering", () => {
  assert.throws(() => planRelease({ ...fixture(), version: "0.1.1" }), /downgrade/);
  const input = fixture();
  input.version = "0.1.10";
  input.changelog = "## [0.1.10] - 2026-09-29\n";
  input.notes = "# v0.1.10 Maintenance\n";
  assert.equal(planRelease(input).manifest.version, "0.1.10");
});

test("preparation is idempotent for a reviewed version", () => {
  const input = fixture();
  const first = planRelease(input);
  assert.deepEqual(planRelease({ ...input, ...first }), first);
});

test("rejects drift in either lockfile version", () => {
  for (const root of [true, false]) {
    const input = fixture();
    if (root) input.lock.version = "0.1.1";
    else input.lock.packages[""].version = "0.1.1";
    assert.throws(() => planRelease(input), /drifted/);
  }
});

test("rejects missing lockfile root", () => {
  const input = fixture();
  delete input.lock.packages[""];
  assert.throws(() => planRelease(input), /drifted/);
});

test("rejects missing, duplicate, or stale client version", () => {
  for (const feedback of ["", fixture().feedback.repeat(2), 'export const APP_VERSION = "0.1.1";\n']) {
    assert.throws(() => planRelease({ ...fixture(), feedback }), /APP_VERSION/);
  }
});

test("requires exact changelog version, not a prefix", () => {
  assert.throws(() => planRelease({ ...fixture(), changelog: "## [0.1.30] - 2026-09-29" }), /CHANGELOG/);
});

test("requires matching release notes", () => {
  for (const notes of [undefined, "", "# v0.1.2 Previous\n"]) {
    assert.throws(() => planRelease({ ...fixture(), notes }), /release notes/);
  }
});
