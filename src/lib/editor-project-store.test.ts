import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createEmptyProject,
  createIndexedDbProjectStore,
  type RecoverScheduler,
} from "./project-store";

/**
 * 共享单例的后台重开接缝(R7-5)。
 *
 * `editorProjectStore` 是模块级构造的,测试拿不到 `createIndexedDbProjectStore` 的
 * `scheduleRecover` 注入点;这里钉住模块自己装的那个调度器:既把探针登记进
 * `projectStoreRecoveryProbe`,又照常把默认周期的 setInterval 装上——
 * 生产行为必须与接缝出现之前完全一致。
 */

/** 前 failures 次 open 直接失败,之后交给真实 factory:模拟瞬时打不开、随后恢复的持久层。 */
function flakyFactory(real: IDBFactory, failures: number): IDBFactory {
  let remaining = failures;
  return {
    cmp: (a: unknown, b: unknown) => real.cmp(a, b),
    databases: () => real.databases(),
    deleteDatabase: (name: string) => real.deleteDatabase(name),
    open: (name: string, version?: number) => {
      if (remaining <= 0) return real.open(name, version);
      remaining -= 1;
      const request = {
        result: undefined,
        error: new DOMException("模拟打开失败", "UnknownError"),
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onupgradeneeded: null,
        onblocked: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
      queueMicrotask(() => request.onerror?.(new Event("error")));
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

/** 每次 open 都失败的 factory:降级之后就再也回不去持久层。 */
function brokenFactory(): IDBFactory {
  return flakyFactory(new IDBFactory(), Number.POSITIVE_INFINITY);
}

/**
 * store 未被覆盖时使用的默认恢复周期。
 * 用一个本地实例把默认值问出来,而不是在测试里复制 project-store 的恢复周期常量。
 */
async function defaultRecoverIntervalMs(): Promise<number> {
  let intervalMs = 0;
  const schedule: RecoverScheduler = (_probe, registered) => {
    intervalMs = registered;
    return () => undefined;
  };
  const store = createIndexedDbProjectStore(brokenFactory(), {
    openRetries: 0,
    retryDelayMs: 0,
    scheduleRecover: schedule,
  });
  await store.list();
  expect(store.health).toBe("memory");
  return intervalMs;
}

/** 在单例构造之前换掉 globalThis.indexedDB,整张模块图必须一起重载。 */
async function loadStoreModule(factory: IDBFactory) {
  vi.stubGlobal("indexedDB", factory);
  vi.resetModules();
  return import("./editor-project-store");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("editor project store recovery probe handle", () => {
  it("未降级时句柄是安全的空操作", async () => {
    const { editorProjectStore, projectStoreRecoveryProbe } = await loadStoreModule(new IDBFactory());

    expect(await editorProjectStore.list()).toEqual([]);
    expect(editorProjectStore.health).toBe("persistent");
    expect(projectStoreRecoveryProbe.scheduled).toBe(false);
    expect(projectStoreRecoveryProbe.intervalMs).toBeNull();
    // 生产代码永远不会调用它,但句柄本身不能在没注册探针时炸掉调用方。
    expect(() => projectStoreRecoveryProbe.run()).not.toThrow();
  });

  it("降级时照常装上默认周期的调度器,句柄只是旁挂在同一个探针上", async () => {
    const timers = vi.spyOn(globalThis, "setInterval");
    const expectedIntervalMs = await defaultRecoverIntervalMs();
    const { editorProjectStore, projectStoreRecoveryProbe } = await loadStoreModule(brokenFactory());

    await editorProjectStore.list();

    expect(editorProjectStore.health).toBe("memory");
    expect(projectStoreRecoveryProbe.scheduled).toBe(true);
    // 单例没有偷偷改短/关掉恢复周期:生产仍旧走 store 的默认间隔。
    expect(projectStoreRecoveryProbe.intervalMs).toBe(expectedIntervalMs);
    expect(timers.mock.calls.some(([, delay]) => delay === expectedIntervalMs)).toBe(true);
  });

  it("run() 推进的是真实的恢复路径,恢复后句柄回到未注册状态", async () => {
    const real = new IDBFactory();
    const { editorProjectStore, projectStoreHealthChannel, projectStoreRecoveryProbe } =
      await loadStoreModule(flakyFactory(real, 2));
    const notices: string[] = [];
    projectStoreHealthChannel.subscribe(() => notices.push(projectStoreHealthChannel.getHealth()));

    const project = { ...createEmptyProject(), id: "proj-degraded", name: "降级项目" };
    await editorProjectStore.put(project);
    expect(editorProjectStore.health).toBe("memory");
    expect(notices).toEqual(["memory"]);

    projectStoreRecoveryProbe.run();

    await vi.waitFor(() => expect(editorProjectStore.health).toBe("persistent"));
    expect(notices).toEqual(["memory", "persistent"]);
    expect(projectStoreHealthChannel.getRecoverError()).toBeNull();
    // 探针被 store 取消了,句柄必须跟着松手,别让测试再推进一个已失效的回调。
    expect(projectStoreRecoveryProbe.scheduled).toBe(false);
    expect(projectStoreRecoveryProbe.intervalMs).toBeNull();
    expect(() => projectStoreRecoveryProbe.run()).not.toThrow();

    // 降级期间的项目确实落到了盘上,而不是只在内存副本里“看起来恢复了”。
    const fresh = createIndexedDbProjectStore(real);
    expect((await fresh.list()).map((item) => item.id)).toEqual(["proj-degraded"]);
    expect((await fresh.get("proj-degraded"))?.name).toBe("降级项目");
  });

  it("恢复不了时留在内存里,句柄仍可反复推进", async () => {
    const { editorProjectStore, projectStoreHealthChannel, projectStoreRecoveryProbe } =
      await loadStoreModule(brokenFactory());

    await editorProjectStore.put({ ...createEmptyProject(), id: "proj-stuck" });
    expect(editorProjectStore.health).toBe("memory");

    projectStoreRecoveryProbe.run();
    projectStoreRecoveryProbe.run();

    expect(editorProjectStore.health).toBe("memory");
    expect(projectStoreRecoveryProbe.scheduled).toBe(true);
    // 打不开数据库是降级期的常态,不该被当成新的写回错误往提示条上报。
    expect(projectStoreHealthChannel.getRecoverError()).toBeNull();
    expect((await editorProjectStore.list()).map((item) => item.id)).toEqual(["proj-stuck"]);
  });
});
