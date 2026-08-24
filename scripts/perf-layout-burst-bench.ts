/**
 * Measures the real card-layout worker under a burst of ten requests.
 * Run five fresh processes before and after coalescing:
 *   npx tsx scripts/perf-layout-burst-bench.ts
 */
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutOptions,
} from "../src/lib/card-layout";
import type {
  CardLayoutWorkerMessage,
  CardLayoutWorkerResponse,
} from "../src/lib/card-layout-worker-protocol";

const REQUEST_COUNT = 10;
const CARD_COUNT = 400;
const QUIET_PERIOD_MS = 100;

interface ReadyMessage {
  type: "ready";
}

interface BurstResult {
  requests: number;
  cardsPerRequest: number;
  latestResultMs: number;
  solvesExecuted: number;
}

function makeCards(count: number, seed = 7): CardLayoutInput[] {
  const cards: CardLayoutInput[] = [];
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const provinceAnchors = Array.from({ length: 34 }, (_, index) => ({
    x: 400 + ((index * 137) % 700),
    y: 150 + ((index * 89) % 560),
  }));
  for (let index = 0; index < count; index += 1) {
    const anchor = provinceAnchors[index % provinceAnchors.length]!;
    cards.push({
      id: `card-${index}`,
      anchorX: anchor.x + (rand() - 0.5) * 60,
      anchorY: anchor.y + (rand() - 0.5) * 60,
      width: 170 + Math.round(rand() * 90),
      height: 70 + Math.round(rand() * 60),
    });
  }
  return cards;
}

function makeBounds(): CardLayoutBounds {
  return {
    width: 1500,
    height: 1000,
    map: { x: 350, y: 120, width: 800, height: 690 },
    margin: 32,
    gap: 14,
  };
}

function createWorker(): ChildProcess {
  return fork(fileURLToPath(import.meta.url), ["--worker"], {
    execArgv: ["--import", "tsx"],
    serialization: "advanced",
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
}

async function waitUntilReady(worker: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onMessage = (message: ReadyMessage | CardLayoutWorkerResponse) => {
      if (message.type !== "ready") return;
      worker.off("message", onMessage);
      resolve();
    };
    worker.on("message", onMessage);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== null && code !== 0) reject(new Error(`布局 worker 提前退出（${code}）`));
    });
  });
}

async function runBurst(): Promise<BurstResult> {
  const worker = createWorker();
  await waitUntilReady(worker);

  const cards = makeCards(CARD_COUNT);
  const bounds = makeBounds();
  const options: CardLayoutOptions = {
    mode: "quadrant",
    autoBalance: true,
    connectorStyle: "curve",
    connectorWidth: 1.5,
  };
  const latestRequestId = REQUEST_COUNT;
  let solvesExecuted = 0;
  const startedAt = performance.now();

  const latestResultMs = await new Promise<number>((resolve, reject) => {
    worker.on("message", (response: CardLayoutWorkerResponse) => {
      if (response.type !== "result") return;
      solvesExecuted += 1;
      if (response.requestId === latestRequestId) {
        resolve(performance.now() - startedAt);
      }
    });
    worker.once("error", reject);

    for (let index = 1; index <= REQUEST_COUNT; index += 1) {
      const request: CardLayoutWorkerMessage = {
        type: "solve",
        requestId: index,
        key: `burst-${index}`,
        cards,
        bounds,
        options,
      };
      worker.send(request);
    }
  });

  await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD_MS));
  const exited = new Promise<void>((resolve) => worker.once("exit", () => resolve()));
  worker.kill();
  await exited;
  return {
    requests: REQUEST_COUNT,
    cardsPerRequest: CARD_COUNT,
    latestResultMs,
    solvesExecuted,
  };
}

if (process.argv.includes("--worker")) {
  const workerScope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<CardLayoutWorkerMessage>) => void) | null;
    postMessage: (message: CardLayoutWorkerResponse) => void;
  };
  workerScope.onmessage = null;
  workerScope.postMessage = (message) => process.send?.(message);
  process.on("message", (message: CardLayoutWorkerMessage) => {
    workerScope.onmessage?.({ data: message } as MessageEvent<CardLayoutWorkerMessage>);
  });
  await import("../src/workers/card-layout.worker.ts");
  process.send?.({ type: "ready" } satisfies ReadyMessage);
} else {
  const result = await runBurst();
  console.log(JSON.stringify({
    ...result,
    latestResultMs: Number(result.latestResultMs.toFixed(1)),
  }));
}
