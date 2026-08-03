import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [command, ...args] = process.argv.slice(2);
const isWindows = process.platform === "win32";
const lockPath = process.env.HERMES_HEAVY_LOCK ?? join(tmpdir(), "cengfan-map-heavy.lock");
const timeoutMs = Number(process.env.HERMES_HEAVY_LOCK_TIMEOUT ?? 120) * 1_000;

if (!command) {
  console.error("Usage: node scripts/run-heavy.mjs <command> [...args]");
  process.exit(1);
}

async function waitForLock() {
  if (isWindows) return () => undefined;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await mkdir(lockPath);
      return () => rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("Another project validation task is running; refusing to overlap.");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

const release = await waitForLock().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(75);
});

function quoteForCmd(value) {
  if (!/[\s"^&|<>]/.test(value)) return value;
  return `"${value.replace(/(["\\^&|<>])/g, "^$1")}"`;
}

const useNice = !isWindows && process.env.HERMES_HEAVY_NICE !== "0";
const child = isWindows
  ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [command, ...args.map(quoteForCmd)].join(" ")], { stdio: "inherit" })
  : spawn(useNice ? "nice" : command, useNice ? ["-n", process.env.HERMES_HEAVY_NICE ?? "12", command, ...args] : args, { stdio: "inherit" });

child.on("error", (error) => {
  console.error(`Unable to start ${command}: ${error.message}`);
});
child.on("exit", async (code, signal) => {
  await release?.();
  process.exitCode = signal ? 1 : (code ?? 1);
});
