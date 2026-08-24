import {
  createIndexedDbProjectStore,
  type ProjectStore,
  type ProjectStoreError,
  type ProjectStoreHealth,
} from "./project-store";

/** 订阅槽:store 在构造时就要拿到回调,而路由组件要到首次渲染才存在。 */
const healthSubscribers = new Set<() => void>();

function notifyHealthSubscribers(): void {
  for (const notify of [...healthSubscribers]) notify();
}

/** 最近一次后台写回失败(典型是配额耗尽);恢复持久化后必须清掉,否则提示条会挂着过期的错误。 */
let latestRecoverError: ProjectStoreError | null = null;

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
