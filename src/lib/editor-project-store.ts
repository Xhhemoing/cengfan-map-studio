import {
  createIndexedDbProjectStore,
  type ProjectStore,
  type ProjectStoreError,
  type ProjectStoreHealth,
  type RecoverScheduler,
} from "./project-store";

/** 订阅槽:store 在构造时就要拿到回调,而路由组件要到首次渲染才存在。 */
const healthSubscribers = new Set<() => void>();

function notifyHealthSubscribers(): void {
  for (const notify of [...healthSubscribers]) notify();
}

/** 最近一次后台写回失败(典型是配额耗尽);恢复持久化后必须清掉,否则提示条会挂着过期的错误。 */
let latestRecoverError: ProjectStoreError | null = null;

/**
 * 后台重开探针的测试可见句柄。
 *
 * **仅供测试使用**,生产代码不要调用:探针照常由默认周期调度器驱动,这里只是把同一个
 * 回调登记出来。单例是模块级构造的,测试拿不到 `scheduleRecover` 注入点,否则只能劫持
 * 全局 `setInterval` 再按 20s 这个实现常量把探针猜出来——既复制了常量,又留下拆卸顺序的地雷。
 * 未降级(探针尚未注册)时 `run()` 是安全的空操作。
 */
export interface ProjectStoreRecoveryProbe {
  /** 立即跑一拍后台重开探针;未注册时什么都不做。 */
  run(): void;
  /** 探针是否已注册,即 store 已降级并装上了周期调度器。 */
  readonly scheduled: boolean;
  /** 调度器收到的周期,未注册时为 null;用来确认生产仍走 store 的默认间隔。 */
  readonly intervalMs: number | null;
}

let registeredProbe: (() => Promise<void>) | null = null;
let registeredIntervalMs: number | null = null;

export const projectStoreRecoveryProbe: ProjectStoreRecoveryProbe = {
  run() { void registeredProbe?.(); },
  get scheduled() { return registeredProbe !== null; },
  get intervalMs() { return registeredIntervalMs; },
};

/**
 * 生产调度器:与 project-store 的默认实现同形(同一个 setInterval + unref),周期由 store 传入,
 * 这里不复制任何间隔常量。额外做的只是把探针登记给上面的句柄。
 */
const scheduleRecover: RecoverScheduler = (probe, intervalMs) => {
  const timer = setInterval(() => { void probe(); }, intervalMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  registeredProbe = probe;
  registeredIntervalMs = intervalMs;
  return () => {
    clearInterval(timer);
    // 恢复成功后句柄要跟着回到未注册状态,别让测试推进一个已经取消的探针。
    if (registeredProbe === probe) {
      registeredProbe = null;
      registeredIntervalMs = null;
    }
  };
};

/**
 * 全站唯一的项目库实例。
 * 工作台路由、编辑器路由与崩溃边界必须共用同一个连接:降级之后每个实例各自持有一份内存副本,
 * 在工作台创建的项目会在编辑器路由上变成"项目不存在",崩溃屏也会去问一个与用户无关的 store。
 */
export const editorProjectStore: ProjectStore = createIndexedDbProjectStore(globalThis.indexedDB, {
  onHealthChange: (health) => {
    if (health === "persistent") latestRecoverError = null;
    notifyHealthSubscribers();
  },
  onRecoverError: (error) => {
    latestRecoverError = error;
    notifyHealthSubscribers();
  },
  scheduleRecover,
});

/** 存储健康度的外部数据源,供 `useSyncExternalStore` 订阅:内存→持久的恢复要让提示自行消失。 */
export interface ProjectStoreHealthChannel {
  subscribe(notify: () => void): () => void;
  getHealth(): ProjectStoreHealth;
  getRecoverError(): ProjectStoreError | null;
}

export const projectStoreHealthChannel: ProjectStoreHealthChannel = {
  subscribe(notify: () => void): () => void {
    healthSubscribers.add(notify);
    return () => { healthSubscribers.delete(notify); };
  },
  // 每次都重新读取快照,而不是把降级前的值定格下来。
  getHealth: () => editorProjectStore.health,
  getRecoverError: () => latestRecoverError,
};
