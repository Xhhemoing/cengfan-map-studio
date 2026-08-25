import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createIndexedDbProjectStore,
  ProjectStoreError,
  type ProjectStoreHealth,
} from "./project-store";
import {
  abortWithQuotaError,
  failingFactory,
  flakyFactory,
  hookedFactory,
  manualRecoverProbe,
  storedProject,
} from "./project-store-test-fixtures";

describe("project store recovery after memory degrade", () => {
  it("writes memory-only projects back to disk and flips health once", async () => {
    const real = new IDBFactory();
    const flaky = flakyFactory(real, 2);
    const changes: ProjectStoreHealth[] = [];
    const probe = manualRecoverProbe();
    const store = createIndexedDbProjectStore(flaky.factory, {
      openRetries: 1,
      retryDelayMs: 0,
      onHealthChange: (health) => changes.push(health),
      scheduleRecover: probe.schedule,
    });

    await store.put(storedProject("proj-degraded", "降级项目"));
    expect(store.health).toBe("memory");
    expect(changes).toEqual(["memory"]);

    // 一个探针周期内降级是粘住的：读写都走内存，不会各自重开数据库。
    const opensWhileDegraded = flaky.opens();
    await store.list();
    await store.get("proj-degraded");
    await store.put(storedProject("proj-degraded-2", "降级项目二"));
    expect(flaky.opens()).toBe(opensWhileDegraded);

    await probe.tick();

    expect(store.health).toBe("persistent");
    expect(changes).toEqual(["memory", "persistent"]);
    expect(probe.cancelled).toBe(1);

    // 恢复后再触发一拍必须是空操作：onHealthChange("persistent") 每次恢复只发一次。
    await probe.tick();
    expect(changes).toEqual(["memory", "persistent"]);

    const fresh = createIndexedDbProjectStore(real);
    expect((await fresh.list()).map((project) => project.id).sort())
      .toEqual(["proj-degraded", "proj-degraded-2"]);
    expect((await fresh.get("proj-degraded"))?.name).toBe("降级项目");
    expect((await store.list()).map((project) => project.id).sort())
      .toEqual(["proj-degraded", "proj-degraded-2"]);
  });

  it("keeps the in-session edit on id collision and still lists disk-only projects", async () => {
    const real = new IDBFactory();
    const seed = createIndexedDbProjectStore(real);
    await seed.put(storedProject("proj-shared", "磁盘上的旧版本"));
    await seed.put(storedProject("proj-disk-only", "只在磁盘上"));

    const flaky = flakyFactory(real, 2);
    const probe = manualRecoverProbe();
    const store = createIndexedDbProjectStore(flaky.factory, {
      openRetries: 1,
      retryDelayMs: 0,
      scheduleRecover: probe.schedule,
    });
    await store.put({
      ...storedProject("proj-shared", "会话内的新版本"),
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(store.health).toBe("memory");

    await probe.tick();

    expect(store.health).toBe("persistent");
    const fresh = createIndexedDbProjectStore(real);
    expect((await fresh.list()).map((project) => project.id).sort())
      .toEqual(["proj-disk-only", "proj-shared"]);
    expect((await fresh.get("proj-shared"))?.name).toBe("会话内的新版本");
    expect((await fresh.get("proj-disk-only"))?.name).toBe("只在磁盘上");
  });

  it("stays degraded and reports the typed quota error when the write-back cannot fit", async () => {
    const real = new IDBFactory();
    let quotaArmed = false;
    let skippedReconcile = false;
    let writeTransactions = 0;
    const hooked = hookedFactory(real, (tx) => {
      if (tx.mode !== "readwrite") return;
      writeTransactions += 1;
      if (!quotaArmed) return;
      // 打开连接时的元数据校正也是 readwrite 事务，放过它，只让写回事务撞配额。
      if (!skippedReconcile) {
        skippedReconcile = true;
        return;
      }
      abortWithQuotaError(tx);
    });
    const flaky = flakyFactory(hooked, 2);
    const changes: ProjectStoreHealth[] = [];
    const failures: ProjectStoreError[] = [];
    const probe = manualRecoverProbe();
    let clock = 1_000;
    const store = createIndexedDbProjectStore(flaky.factory, {
      openRetries: 1,
      retryDelayMs: 0,
      recoverIntervalMs: 20_000,
      now: () => clock,
      onHealthChange: (health) => changes.push(health),
      onRecoverError: (error) => failures.push(error),
      scheduleRecover: probe.schedule,
    });
    await store.put(storedProject("proj-quota-degraded", "配额降级项目"));

    quotaArmed = true;
    await probe.tick();

    expect(store.health).toBe("memory");
    expect(changes).toEqual(["memory"]);
    expect(failures.map((error) => error.code)).toEqual(["quota-exceeded"]);
    expect(failures[0]?.message).toContain("本机存储空间不足");
    expect(probe.cancelled).toBe(0);

    // 退避窗口内的探针不能继续砸盘：不新建写事务，也不重复上报。
    const writesAfterQuota = writeTransactions;
    await probe.tick();
    expect(writeTransactions).toBe(writesAfterQuota);
    expect(failures).toHaveLength(1);

    quotaArmed = false;
    clock += 20_000 * 4;
    await probe.tick();

    expect(store.health).toBe("persistent");
    expect(changes).toEqual(["memory", "persistent"]);
    expect((await createIndexedDbProjectStore(real).list()).map((project) => project.id))
      .toEqual(["proj-quota-degraded"]);
  });

  it("schedules the background probe slowly enough not to storm the database", async () => {
    const probe = manualRecoverProbe();
    const store = createIndexedDbProjectStore(failingFactory(() => undefined), {
      openRetries: 0,
      retryDelayMs: 0,
      scheduleRecover: probe.schedule,
    });

    await store.list();

    expect(store.health).toBe("memory");
    expect(probe.intervalMs).toBeGreaterThanOrEqual(15_000);
  });
});
