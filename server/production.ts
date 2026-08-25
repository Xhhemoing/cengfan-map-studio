export type ProductionEnvironment = Record<string, string | undefined>;

export interface ProductionConfig {
  nodeEnv: "development" | "production";
  aiPublicAccess: boolean;
  trustProxy: boolean;
  dataDir: string;
  aiStateFile: string;
  shutdownTimeoutMs: number;
}

export interface ProductionConfigResult {
  ok: boolean;
  config?: ProductionConfig;
  errors: string[];
}

const MIN_RECEIPT_SECRET_LENGTH = 32;
const DEFAULT_DATA_DIR = ".data";
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isProduction(env: ProductionEnvironment): boolean {
  return (env.NODE_ENV ?? "development").trim().toLowerCase() === "production";
}

export function validateProductionConfig(env: ProductionEnvironment = process.env): ProductionConfigResult {
  const production = isProduction(env);
  const errors: string[] = [];
  const receiptSecret = env.AI_BUDGET_RECEIPT_SECRET?.trim() ?? "";
  const aiConfigured = Boolean(
    (env.AI_PRIMARY_API_KEY ?? env.AI_API_KEY ?? env.DEEPSEEK_API_KEY)?.trim()
    && (env.AI_PRIMARY_MODEL ?? env.AI_MODEL)?.trim(),
  );
  const aiPublicAccess = env.AI_PUBLIC_ACCESS === "1";
  const trustProxyValue = env.TRUST_PROXY;

  if (production && receiptSecret.length < MIN_RECEIPT_SECRET_LENGTH) {
    errors.push("AI_BUDGET_RECEIPT_SECRET_TOO_SHORT");
  }
  if (trustProxyValue !== undefined && trustProxyValue !== "0" && trustProxyValue !== "1") {
    errors.push("TRUST_PROXY_INVALID");
  }
  if (production && aiConfigured && !aiPublicAccess && !(env.WORKSPACE_API_TOKEN?.trim())) {
    errors.push("AI_ACCESS_POLICY_MISSING");
  }

  const dataDir = env.DATA_DIR?.trim() || DEFAULT_DATA_DIR;
  const aiStateFile = env.AI_STATE_FILE?.trim() || `${dataDir}/ai-runtime-state.json`;
  const shutdownTimeoutMs = positiveInteger(env.SHUTDOWN_TIMEOUT_MS, DEFAULT_SHUTDOWN_TIMEOUT_MS);
  const config: ProductionConfig = {
    nodeEnv: production ? "production" : "development",
    aiPublicAccess,
    trustProxy: trustProxyValue === "1",
    dataDir,
    aiStateFile,
    shutdownTimeoutMs,
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, config, errors };
}

/**
 * 关停失败发生在哪一步。上报走同一个口（onFlushError）而不是每步一个钩子：
 * 关停里每一步都可能失败，一步一个钩子会让接线的人漏掉其中几个——「排空失败被吞掉」
 * 正是这么来的。单口 + 判别字段则是漏不掉的：接了就全都收得到，新增阶段也不用改接线。
 */
export type ShutdownFailurePhase = "draining" | "close" | "drain" | "flush" | "timeout";

export interface ShutdownFailureContext {
  phase: ShutdownFailurePhase;
}

export interface ServerLifecycleOptions {
  server: { close: (callback: () => void) => void };
  flush: () => Promise<void>;
  timeoutMs?: number;
  onDraining?: () => void;
  /** 结束长连接（SSE）并放走空闲 keep-alive 连接，否则 close 的回调永远等不到。 */
  drain?: () => void | Promise<void>;
  /** 截止时间到时的兜底：强行切断仍在途的连接，避免单个请求拖住退出。 */
  onTimeout?: () => void;
  /**
   * 关停失败的统一上报口，第二个参数说明失败发生在哪一步；
   * 不传时按阶段打到 console.error，绝不能让任何一步的失败静默。
   */
  onFlushError?: (error: unknown, context: ShutdownFailureContext) => void;
  setTimeoutFn?: typeof setTimeout;
}

const SHUTDOWN_FAILURE_MESSAGE: Record<ShutdownFailurePhase, string> = {
  draining: "[shutdown] 关停通知钩子抛错，关停继续",
  close: "[shutdown] 关闭监听失败，可能还有端口占用",
  drain: "[shutdown] 排空连接失败，在途长连接可能被硬断",
  flush: "[shutdown] 状态落盘失败，本次退出可能丢失房间与 AI 状态",
  timeout: "[shutdown] 截止兜底失败，仍有连接没能强行切断",
};

export function createServerLifecycle(options: ServerLifecycleOptions) {
  let draining = false;
  let shutdownPromise: Promise<void> | null = null;
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;

  // 关停失败一律有声：刷盘失败意味着房间与 AI 状态没落到盘上、排空失败意味着连接被硬断，
  // 而退出码仍是 0；不上报就等于静默丢数据。
  const report = (error: unknown, phase: ShutdownFailurePhase) => {
    try {
      if (options.onFlushError) options.onFlushError(error, { phase });
      else console.error(SHUTDOWN_FAILURE_MESSAGE[phase], error);
    } catch {
      // 上报通道自己坏了也不能挡住退出。
    }
  };

  const shutdown = (signal = "SIGTERM"): Promise<void> => {
    void signal;
    if (shutdownPromise) return shutdownPromise;
    draining = true;
    let resolveShutdown!: () => void;
    // 先把 promise 记下来再跑任何钩子：钩子里若再触发一次关停（重复信号、
    // 或 onDraining/close 回调内部重入），拿到的必须是同一个 promise。
    shutdownPromise = new Promise<void>((resolve) => { resolveShutdown = resolve; });

    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // 关停只有在监听关闭「且」状态落盘之后才算完成；先到的一方不能代表另一方。
    let pending = 2;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolveShutdown();
    };
    const step = () => {
      pending -= 1;
      if (pending <= 0) finish();
    };

    // 截止时间先武装：记名的 promise 一旦存在，就必须有人负责让它落地，
    // 哪怕下面的同步段（onDraining/close）抛异常也不能留下永远挂着的关停。
    timeout = setTimeoutFn(() => {
      try {
        options.onTimeout?.();
      } catch (error) {
        // 兜底动作失败也不能挡住退出，但要留下记录。
        report(error, "timeout");
      }
      finish();
    }, timeoutMs);
    // shutdown 是在信号处理器里被调用的：这里抛出去没人接，等于 uncaughtException 打断关停，
    // close/drain/flush 一个都跑不到。所以钩子的异常只上报，关停照常往下走。
    try {
      options.onDraining?.();
    } catch (error) {
      report(error, "draining");
    }
    try {
      options.server.close(() => step());
    } catch (error) {
      report(error, "close");
      step();
    }
    // 排空排在 close 之后：close 只停止接收新连接，挂着的长连接得自己结束；
    // 刷盘再排在排空之后，避免把「排空过程中产生的写入」漏在快照外面。
    // 排空失败只上报不中断：连接没走干净更要把状态落盘。
    void Promise.resolve()
      .then(() => options.drain?.())
      .catch((error: unknown) => { report(error, "drain"); })
      .then(() => options.flush())
      .catch((error: unknown) => { report(error, "flush"); })
      .finally(step);

    return shutdownPromise;
  };

  return {
    shutdown,
    isDraining: () => draining,
  };
}
