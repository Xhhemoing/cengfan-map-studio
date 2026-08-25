import { copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-heavy.mjs", command, ...args], {
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed`)));
  });
}

try {
  await run("tsc", ["-b"]);
  await run("vite", ["build"]);
  // GitHub Pages serves 404.html for unknown paths such as /prototype.
  await copyFile("dist/index.html", "dist/404.html");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
