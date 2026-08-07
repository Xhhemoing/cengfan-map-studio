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

export interface ServerLifecycleOptions {
  server: { close: (callback: () => void) => void };
  flush: () => Promise<void>;
  timeoutMs?: number;
  onDraining?: () => void;
  setTimeoutFn?: typeof setTimeout;
}

export function createServerLifecycle(options: ServerLifecycleOptions) {
  let draining = false;
  let shutdownPromise: Promise<void> | null = null;
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;

  const shutdown = (signal = "SIGTERM"): Promise<void> => {
    void signal;
    if (shutdownPromise) return shutdownPromise;
    draining = true;
    options.onDraining?.();
    shutdownPromise = new Promise<void>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) clearTimeout(timeout);
        resolve();
      };
      timeout = setTimeoutFn(finish, timeoutMs);
      try {
        options.server.close(() => finish());
      } catch {
        finish();
      }
      void options.flush().catch(() => undefined).finally(finish);
    });
    return shutdownPromise;
  };

  return {
    shutdown,
    isDraining: () => draining,
  };
}
