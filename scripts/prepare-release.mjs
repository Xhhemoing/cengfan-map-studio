import { readFile, writeFile } from "node:fs/promises";
import { planRelease, validateVersion } from "./release-metadata.mjs";

try {
  const version = process.argv[2];
  validateVersion(version); // Validate before interpolating into a path.
  const paths = ["package.json", "package-lock.json", "src/lib/feedback-links.ts"];
  const [manifest, lock, feedback, changelog, notes] = await Promise.all([
    ...paths.map((path) => readFile(path, "utf8")),
    readFile("CHANGELOG.md", "utf8"),
    readFile(`docs/releases/v${version}.md`, "utf8"),
  ]);
  const plan = planRelease({
    version, manifest: JSON.parse(manifest), lock: JSON.parse(lock), feedback, changelog, notes,
  });
  const contents = [
    `${JSON.stringify(plan.manifest, null, 2)}\n`,
    `${JSON.stringify(plan.lock, null, 2)}\n`,
    plan.feedback,
  ];
  for (const [index, path] of paths.entries()) await writeFile(path, contents[index]);
  console.log(`Prepared v${version}; dependency resolutions are unchanged. Review git diff before publishing.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
