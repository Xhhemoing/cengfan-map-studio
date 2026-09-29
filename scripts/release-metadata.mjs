/** Pure release planning: no network, lifecycle hooks, or dependency updates. */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const APP_VERSION = /^export const APP_VERSION = "([^"]+)";$/gm;

export function validateVersion(version) {
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error("Version must be a stable x.y.z version without a v prefix");
  }
  return version.split(".").map(BigInt);
}

export function planRelease({ version, manifest, lock, feedback, changelog, notes }) {
  const next = validateVersion(version);
  const current = validateVersion(manifest.version);
  const differing = next.findIndex((part, index) => part !== current[index]);
  if (differing !== -1 && next[differing] < current[differing]) {
    throw new Error("Refusing a version downgrade");
  }
  if (lock.version !== manifest.version || lock.packages?.[""]?.version !== manifest.version) {
    throw new Error("Manifest and lockfile versions have drifted");
  }
  const matches = [...feedback.matchAll(APP_VERSION)];
  if (matches.length !== 1 || matches[0][1] !== manifest.version) {
    throw new Error("Client APP_VERSION must match package.json exactly once");
  }
  if (!changelog.split("\n").some((line) => line.startsWith(`## [${version}] - `))) {
    throw new Error(`Missing CHANGELOG entry for ${version}`);
  }
  if (typeof notes !== "string" || !notes.startsWith(`# v${version} `)) {
    throw new Error(`Missing or mismatched release notes for ${version}`);
  }
  const nextManifest = structuredClone(manifest);
  const nextLock = structuredClone(lock);
  nextManifest.version = version;
  nextLock.version = version;
  nextLock.packages[""].version = version;
  if (nextManifest.engines) nextLock.packages[""].engines = { ...nextManifest.engines };
  return {
    manifest: nextManifest,
    lock: nextLock,
    feedback: feedback.replace(APP_VERSION, `export const APP_VERSION = "${version}";`),
  };
}
