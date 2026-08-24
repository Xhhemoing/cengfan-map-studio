/**
 * Repeat-import benchmark for the workbook parser (R4-9).
 *
 * Method: generate a 5,000-row CSV in memory, then run five alternating-order
 * trials. A cold sample starts a new Node child process for one
 * `parseWorkbookImport` call. A reused sample warms one child with an import and
 * times its second call. The first cold sample is discarded to prime filesystem
 * caches. Both paths send the same base64 payload over stdio.
 *
 * This is a reproducible Node approximation of browser Worker reuse. It measures
 * Node/tsx process and module startup (including Node's xlsx initialization) plus
 * CSV decoding/parsing and stdio. It does NOT measure browser Worker startup,
 * browser xlsx module evaluation, ArrayBuffer transfer, or Worker postMessage.
 * Therefore it can check the direction and rough magnitude of the reuse benefit,
 * but it cannot verify an exact browser percentage.
 *
 * Run with: npx tsx scripts/perf-workbook-bench.ts
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseWorkbookImport } from "../src/workers/workbook-import.worker";

const RUNS = 5;
const ROWS = 5_000;
const CHILD_MODE = "--workbook-bench-child";
const EXPECTED_CANDIDATES = ROWS;
const scriptPath = fileURLToPath(import.meta.url);

interface BenchChild {
  child: ChildProcessWithoutNullStreams;
  lines: AsyncIterator<string>;
  reader: Interface;
  stderr: () => string;
}

function createCsvPayload(): string {
  const csv = [
    "学生姓名,录取院校,城市,去向类型",
    ...Array.from(
      { length: ROWS },
      (_, index) => `学生${index},浙江大学,杭州市,${index % 10 === 0 ? "海外去向" : "中国去向"}`,
    ),
  ].join("\n");
  return Buffer.from(csv, "utf8").toString("base64");
}

function parsePayload(payload: string): number {
  const bytes = Buffer.from(payload, "base64");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return parseWorkbookImport({ buffer, isCsv: true }).parsed?.candidates.length ?? 0;
}

async function runChild(): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  process.stdout.write("ready\n");
  for await (const line of input) {
    if (line === "quit") break;
    try {
      process.stdout.write(`ok:${parsePayload(line)}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`error:${message.replaceAll("\n", " ")}\n`);
    }
  }
}

async function nextLine(session: BenchChild): Promise<string> {
  const next = await session.lines.next();
  if (next.done) {
    throw new Error(`Benchmark child exited before responding${session.stderr() ? `: ${session.stderr()}` : ""}`);
  }
  return next.value;
}

async function startChild(): Promise<BenchChild> {
  const child = spawn(process.execPath, ["--import", "tsx", scriptPath, CHILD_MODE], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const session: BenchChild = {
    child,
    lines: reader[Symbol.asyncIterator](),
    reader,
    stderr: () => stderr.trim(),
  };
  const ready = await nextLine(session);
  if (ready !== "ready") throw new Error(`Unexpected benchmark child handshake: ${ready}`);
  return session;
}

async function requestParse(session: BenchChild, payload: string): Promise<void> {
  session.child.stdin.write(`${payload}\n`);
  const response = await nextLine(session);
  if (response !== `ok:${EXPECTED_CANDIDATES}`) {
    throw new Error(`Unexpected benchmark child response: ${response}`);
  }
}

async function stopChild(session: BenchChild): Promise<void> {
  const exited = once(session.child, "exit");
  session.child.stdin.end("quit\n");
  const [code, signal] = await exited;
  session.reader.close();
  if (code !== 0) {
    throw new Error(
      `Benchmark child failed (code=${String(code)}, signal=${String(signal)})`
      + (session.stderr() ? `: ${session.stderr()}` : ""),
    );
  }
}

async function measureCold(payload: string): Promise<number> {
  const startedAt = performance.now();
  const session = await startChild();
  try {
    await requestParse(session, payload);
    return performance.now() - startedAt;
  } finally {
    await stopChild(session);
  }
}

async function measureReused(payload: string): Promise<number> {
  const session = await startChild();
  try {
    await requestParse(session, payload);
    const startedAt = performance.now();
    await requestParse(session, payload);
    return performance.now() - startedAt;
  } finally {
    await stopChild(session);
  }
}

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)]!;
}

function tableRow(label: string, samples: readonly number[]): string {
  return `| ${label} | ${samples.map((sample) => sample.toFixed(1)).join(" | ")} | ${median(samples).toFixed(1)} |`;
}

async function runBenchmark(): Promise<void> {
  const payload = createCsvPayload();
  await measureCold(payload);

  const cold: number[] = [];
  const reused: number[] = [];
  for (let index = 0; index < RUNS; index += 1) {
    if (index % 2 === 0) {
      cold.push(await measureCold(payload));
      reused.push(await measureReused(payload));
    } else {
      reused.push(await measureReused(payload));
      cold.push(await measureCold(payload));
    }
  }

  const coldMedian = median(cold);
  const reusedMedian = median(reused);
  const improvement = ((coldMedian - reusedMedian) / coldMedian) * 100;
  const claimedImprovement = 62.3;
  const claimedBand = [claimedImprovement * 0.5, claimedImprovement * 1.5] as const;
  const withinClaimedBand = improvement >= claimedBand[0] && improvement <= claimedBand[1];

  console.log(`synthetic-csv-rows=${ROWS} runs=${RUNS}`);
  console.log("| mode | run 1 (ms) | run 2 (ms) | run 3 (ms) | run 4 (ms) | run 5 (ms) | median (ms) |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  console.log(tableRow("cold child/import", cold));
  console.log(tableRow("reused child, second import", reused));
  console.log(`reuse-faster-percent=${improvement.toFixed(1)}`);
  console.log(
    `within-claimed-31.2-to-93.5-percent-band=${withinClaimedBand ? "yes" : "no"}; exact-browser-claim-verified=no`,
  );
}

if (process.argv.includes(CHILD_MODE)) {
  await runChild();
} else {
  await runBenchmark();
}
