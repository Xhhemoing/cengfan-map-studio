export const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

/** 网络分区:TCP 连上了,响应永远不来。没有截止时间的客户端会永久挂起。 */
export const neverSettles = (): Promise<Response> => new Promise<Response>(() => {});

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  fail(): void {
    this.onerror?.();
  }
}

/** 手动时钟:请求截止与重试退避都走注入的 schedule,延迟序列可断言且不留真实定时器。 */
export function createManualClock() {
  const tasks = new Map<number, () => void>();
  let nextId = 0;
  const delays: number[] = [];
  const clock = {
    delays,
    get pending(): number {
      return tasks.size;
    },
    schedule(handler: () => void, delayMs: number): () => void {
      const id = nextId++;
      delays.push(delayMs);
      tasks.set(id, handler);
      return () => {
        tasks.delete(id);
      };
    },
    /** 触发最早排入的定时器(截止时间先于其后的退避排入),模拟"这段时间过去了"。 */
    async fireNext(): Promise<void> {
      const first = tasks.entries().next();
      if (first.done) throw new Error("没有待触发的定时器");
      const [id, handler] = first.value;
      tasks.delete(id);
      handler();
      await Promise.resolve();
    },
  };
  return clock;
}

/** Manually driven timers so backoff is observable and leaks are assertable. */
export function createTimeline() {
  const pending = new Map<number, { delay: number; handler: () => void }>();
  let nextId = 0;
  return {
    pending,
    delays: [] as number[],
    schedule(handler: () => void, delayMs: number): () => void {
      const id = nextId++;
      this.delays.push(delayMs);
      pending.set(id, { delay: delayMs, handler });
      return () => pending.delete(id);
    },
    async runNext(): Promise<void> {
      const entry = pending.entries().next();
      if (entry.done) return;
      const [id, task] = entry.value;
      pending.delete(id);
      task.handler();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
