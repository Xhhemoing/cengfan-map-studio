import { spawn } from "node:child_process";

const apiPort = process.env.PORT ?? "8787";
const isWindows = process.platform === "win32";
function start(command, args, env) {
  if (isWindows) {
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [command, ...args].join(" ")], {
      stdio: "inherit",
      env,
    });
  }
  return spawn(command, args, { stdio: "inherit", env });
}

const children = [
  start("vite", [], { ...process.env, API_PORT: apiPort }),
  start("tsx", ["server/index.ts"], { ...process.env, PORT: apiPort }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(`Unable to start development process: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(signal || code !== 0 ? 1 : 0);
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
