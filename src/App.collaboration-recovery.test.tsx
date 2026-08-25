// 从 src/App.test.tsx 原样搬出：送出 effect 的冲突回退与分区自愈。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { sampleStudents } from "./lib/project-data";
import { COLLABORATION_SEND_DELAY_MS } from "./lib/app-constants";
import { CollaborationClientError } from "./lib/collaboration-client";
import { installAppTestHarness, renderApp, click, ScriptedEventSource, json, ownedRoom, collaborationStatus, createRoomFromMenu, renameStudent, pathsOf, type UploadedTransaction, stubStream } from "./app-test-harness";

installAppTestHarness();

describe("Collaboration send effect recovery (R2-3)", () => {
  it("recovers from a version conflict by backfilling, re-diffing and resubmitting once", async () => {
    const container = renderApp();
    const roomId = "CONF01";
    const restoreStream = stubStream();
    const originalFetch = globalThis.fetch;
    const uploads: UploadedTransaction[] = [];
    const backfills: string[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
      if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
        const body = JSON.parse(String(init?.body)) as UploadedTransaction;
        if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        uploads.push(body);
        // 第一笔增量撞上他人已经提交的 v2。
        if (uploads.length === 1) return json({ error: { code: "VERSION_CONFLICT", message: "版本冲突", currentVersion: 2 } }, 409);
        return json({ id: roomId, version: 3, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
      }
      if (url.includes(`/api/rooms/${roomId}/operations`)) {
        backfills.push(url);
        return json({ id: roomId, version: 2, afterVersion: 1, operations: [{ type: "set", path: ["renderSettings", "fixedFps"], value: 45 }] });
      }
      if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
      return json({});
    });
    globalThis.fetch = request as unknown as typeof fetch;
    try {
      await createRoomFromMenu(container);
      renameStudent(container, "林舟", "冲突林舟");

      await vi.waitFor(() => expect(uploads).toHaveLength(2), { timeout: 5_000 });
      expect(uploads[0]!.baseVersion).toBe(1);
      expect(backfills).toHaveLength(1);
      expect(backfills[0]).toContain("afterVersion=1");
      // 重投必须落在补齐后的版本上,并且只带本地增量:把远端刚落地的修改当成本地改动
      // 重新上传就等于静默回滚别人的编辑。
      expect(uploads[1]!.baseVersion).toBe(2);
      expect(uploads[1]!.txId).not.toBe(uploads[0]!.txId);
      expect(pathsOf(uploads[1]!)).not.toContain("renderSettings.fixedFps");
      expect(pathsOf(uploads[1]!)).toContain("project.students");
      await vi.waitFor(() => expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("connected"));
      expect(container.textContent).not.toContain("请重新加入房间");
    } finally {
      globalThis.fetch = originalFetch;
      restoreStream();
    }
  });

  it("bounds conflict recovery to a single retry instead of resubmitting forever", async () => {
    const container = renderApp();
    const roomId = "CONF02";
    const restoreStream = stubStream();
    const originalFetch = globalThis.fetch;
    const uploads: UploadedTransaction[] = [];
    const backfills: string[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
      if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
        const body = JSON.parse(String(init?.body)) as UploadedTransaction;
        if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        uploads.push(body);
        return json({ error: { code: "VERSION_CONFLICT", message: "版本冲突", currentVersion: uploads.length + 1 } }, 409);
      }
      if (url.includes(`/api/rooms/${roomId}/operations`)) {
        backfills.push(url);
        return json({ id: roomId, version: 2, afterVersion: 1, operations: [{ type: "set", path: ["renderSettings", "fixedFps"], value: 45 }] });
      }
      if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
      return json({});
    });
    globalThis.fetch = request as unknown as typeof fetch;
    try {
      await createRoomFromMenu(container);
      renameStudent(container, "林舟", "顽固冲突林舟");

      await vi.waitFor(() => expect(uploads).toHaveLength(2), { timeout: 5_000 });
      await vi.waitFor(() => expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("conflict"));
      await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 3));
      expect(uploads).toHaveLength(2);
      expect(backfills).toHaveLength(1);
      expect(container.textContent).not.toContain("请重新加入房间");
    } finally {
      globalThis.fetch = originalFetch;
      restoreStream();
    }
  });

  it("skips its own echoed operations instead of folding them into the baseline twice", async () => {
    const container = renderApp();
    const roomId = "ECHO01";
    const restoreStream = stubStream();
    const originalFetch = globalThis.fetch;
    const uploads: UploadedTransaction[] = [];
    let releaseFirstUpload: (() => void) | null = null;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
      if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
        const body = JSON.parse(String(init?.body)) as UploadedTransaction;
        if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        uploads.push(body);
        if (uploads.length > 1) return json({ id: roomId, version: 5, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        // 回执压在流后面:自己的 ops 事件先回来,再叠一次远端修改。
        return new Promise<Response>((resolve) => {
          releaseFirstUpload = () => resolve(json({ id: roomId, version: 2, ready: true, updatedBy: body.clientId, lastTxId: body.txId }));
        });
      }
      if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
      return json({});
    });
    globalThis.fetch = request as unknown as typeof fetch;
    try {
      await createRoomFromMenu(container);
      renameStudent(container, "林舟", "回声林舟");
      await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });

      const own = uploads[0]!;
      const stream = ScriptedEventSource.instances[0]!;
      // 服务端把本客户端的事务广播回来(updatedBy/lastTxId 就是本次事务)。
      stream.emit("snapshot", { id: roomId, version: 2, updatedBy: own.clientId, lastTxId: own.txId, operations: own.operations });
      // 紧接着另一位成员删掉了同一名学生。
      stream.emit("snapshot", {
        id: roomId,
        version: 3,
        updatedBy: "c-remote",
        lastTxId: "tx-remote",
        operations: [{ type: "array-remove", path: ["project", "students"], itemId: "student-1" }],
      });
      releaseFirstUpload!();
      await new Promise((resolve) => setTimeout(resolve, 50));

      renameStudent(container, sampleStudents[1]!.name, "回声林二");
      await vi.waitFor(() => expect(uploads).toHaveLength(2), { timeout: 5_000 });

      // 回声已经把这批 ops 并进基线;回执再叠一次会让被删掉的学生在基线里复活,
      // 下一次 diff 就会替远端补一条删除,等于把别人的删除重放回去。
      expect(uploads[1]!.operations.filter((operation) => operation.type === "array-remove")).toHaveLength(0);
      expect(uploads[1]!.baseVersion).toBe(3);
      expect(container.textContent).not.toContain("回声林舟");
    } finally {
      globalThis.fetch = originalFetch;
      restoreStream();
    }
  });

  it("ignores an in-flight acknowledgement once the room has been left", async () => {
    const container = renderApp();
    const roomId = "LEAVE1";
    const restoreStream = stubStream();
    const originalFetch = globalThis.fetch;
    const uploads: UploadedTransaction[] = [];
    let releaseUpload: (() => void) | null = null;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
      if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
        const body = JSON.parse(String(init?.body)) as UploadedTransaction;
        if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        uploads.push(body);
        return new Promise<Response>((resolve) => {
          releaseUpload = () => resolve(json({ id: roomId, version: 2, ready: true, updatedBy: body.clientId, lastTxId: body.txId }));
        });
      }
      if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
      return json({});
    });
    globalThis.fetch = request as unknown as typeof fetch;
    try {
      await createRoomFromMenu(container);
      renameStudent(container, "林舟", "离场林舟");
      await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });

      click(container.querySelector<HTMLButtonElement>("button.collaboration-leave")!);
      expect(collaborationStatus(container)?.textContent).toContain("已断开");
      releaseUpload!();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 房间已经退出:在途回执既不能把面板改回「已连接」,也不该再写任何协作状态。
      expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("idle");
      expect(collaborationStatus(container)?.textContent).toContain("已断开");
      expect(container.textContent).not.toContain("增量同步已完成");
    } finally {
      globalThis.fetch = originalFetch;
      restoreStream();
    }
  });

  describe("partition heal auto-resend (R3-2)", () => {
    /** 分区形态:上传打到截止时间才失败,事务根本没有落到服务端。 */
    function timedOut(): never {
      throw new CollaborationClientError("REQUEST_TIMEOUT", "协作服务无响应，网络可能已中断");
    }

    it("resends the diff stranded by a partition once a stream event proves the link is back", async () => {
      const container = renderApp();
      const roomId = "HEAL01";
      const restoreStream = stubStream();
      const originalFetch = globalThis.fetch;
      const uploads: UploadedTransaction[] = [];
      let partitioned = true;
      const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
        if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
          const body = JSON.parse(String(init?.body)) as UploadedTransaction;
          if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
          uploads.push(body);
          if (partitioned) timedOut();
          return json({ id: roomId, version: 3, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        }
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);
        renameStudent(container, "林舟", "分区林舟");
        await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });
        await vi.waitFor(() => expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("error"));

        // 网络恢复:流上先回来一条别人的增量。此后用户没有任何编辑。
        partitioned = false;
        ScriptedEventSource.instances[0]!.emit("snapshot", {
          id: roomId,
          version: 2,
          updatedBy: "c-remote",
          lastTxId: "tx-remote",
          operations: [{ type: "set", path: ["renderSettings", "fixedFps"], value: 45 }],
        });

        await vi.waitFor(() => expect(uploads).toHaveLength(2), { timeout: 5_000 });
        // 重投落在愈合后的版本上,且只带本地增量:远端刚落地的修改不能被当成本地改动重放。
        expect(uploads[1]!.baseVersion).toBe(2);
        expect(pathsOf(uploads[1]!)).toContain("project.students");
        expect(pathsOf(uploads[1]!)).not.toContain("renderSettings.fixedFps");
        await vi.waitFor(() => expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("connected"));

        // 一次愈合只补投一次:回执推进版本不得再触发一轮上传。
        await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 4));
        expect(uploads).toHaveLength(2);
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });

    it("resends when the offline flag clears even though no new version arrives", async () => {
      const container = renderApp();
      const roomId = "HEAL02";
      const restoreStream = stubStream();
      const originalFetch = globalThis.fetch;
      const uploads: UploadedTransaction[] = [];
      const backfills: string[] = [];
      let partitioned = true;
      const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
        if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
          const body = JSON.parse(String(init?.body)) as UploadedTransaction;
          if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
          uploads.push(body);
          if (partitioned) timedOut();
          return json({ id: roomId, version: 2, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        }
        if (url.includes(`/api/rooms/${roomId}/operations`)) {
          backfills.push(url);
          if (partitioned) timedOut();
          // 分区期间远端什么都没发生:补齐成功但没有区间可套,版本原地不动。
          return json({ id: roomId, version: 1, afterVersion: 1, operations: [] });
        }
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);
        renameStudent(container, "林舟", "离线林舟");
        await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });

        // 断流 → 补齐也打不通 → 面板进入离线态。
        ScriptedEventSource.instances[0]!.onerror!();
        await vi.waitFor(() => expect(container.textContent).toContain("网络已断开"), { timeout: 5_000 });

        // 网络恢复:重连挂上新流,下一次补齐成功把离线态摘掉,期间没有任何编辑与版本推进。
        partitioned = false;
        await vi.waitFor(() => expect(ScriptedEventSource.instances.length).toBeGreaterThan(1), { timeout: 5_000 });
        ScriptedEventSource.instances[1]!.onerror!();

        await vi.waitFor(() => expect(uploads).toHaveLength(2), { timeout: 5_000 });
        expect(uploads[1]!.baseVersion).toBe(1);
        expect(pathsOf(uploads[1]!)).toContain("project.students");
        await vi.waitFor(() => expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("connected"));
        await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 4));
        expect(uploads).toHaveLength(2);
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });

    it("keeps a partitioned upload out of the loop when the link never comes back", async () => {
      const container = renderApp();
      const roomId = "HEAL03";
      const restoreStream = stubStream();
      const originalFetch = globalThis.fetch;
      const uploads: UploadedTransaction[] = [];
      const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
        if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
          const body = JSON.parse(String(init?.body)) as UploadedTransaction;
          if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
          uploads.push(body);
          return timedOut();
        }
        if (url.includes(`/api/rooms/${roomId}/operations`)) return timedOut();
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);
        renameStudent(container, "林舟", "顽固分区林舟");
        await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });

        // 分区持续:没有愈合信号就没有重投,失败本身不能自己拉起下一次上传。
        await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 5));
        expect(uploads).toHaveLength(1);
        expect(container.textContent).toContain("恢复后会自动续传");
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });
  });
});
