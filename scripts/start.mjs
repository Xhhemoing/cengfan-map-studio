import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const child = isWindows
  ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "tsx server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, STATIC_DIR: process.env.STATIC_DIR ?? "dist" },
  })
  : spawn("tsx", ["server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, STATIC_DIR: process.env.STATIC_DIR ?? "dist" },
  });

child.on("error", (error) => {
  console.error(`Unable to start server: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
