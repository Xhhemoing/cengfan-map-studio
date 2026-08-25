// 从 src/App.test.tsx 原样搬出：送出 effect 的分类叙事、终局拒绝与房间持久化降级提示。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { COLLABORATION_SEND_DELAY_MS, ROOM_ACCESS_STORAGE_PREFIX } from "./lib/app-constants";
import { CollaborationClientError } from "./lib/collaboration-client";
import { installAppTestHarness, renderApp, ScriptedEventSource, json, ownedRoom, collaborationStatus, createRoomFromMenu, renameStudent, pathsOf, type UploadedTransaction, stubStream } from "./app-test-harness";

installAppTestHarness();

describe("Collaboration send effect recovery (R2-3)", () => {
  /**
   * 送出侧此前只认识"房间已关闭"一种终局,也没法把自己的传输层失败并进离线叙事:
   * 过期房间还会再发一笔注定失败的事务,而提交超时只改文案、面板上看不出仍在重试。
   */
  describe("collaboration taxonomy wiring (R4-2)", () => {
    function timedOut(): never {
      throw new CollaborationClientError("REQUEST_TIMEOUT", "协作服务无响应，网络可能已中断");
    }

    /** 房间被清理后,ticket 与补齐都会拿到这个终局码。 */
    function roomGone(): Response {
      return json({ error: { code: "ROOM_NOT_FOUND", message: "房间不存在" } }, 404);
    }

    function offlineBanner(container: HTMLElement): HTMLElement | null {
      return container.querySelector<HTMLElement>('[data-collaboration-offline="true"]');
    }

    function expiredBanner(container: HTMLElement): HTMLElement | null {
      return container.querySelector<HTMLElement>('p[data-collaboration-terminal="expired"]');
    }

    it("stops uploading and keeps the expired copy when the room dies during a partition", async () => {
      const container = renderApp();
      const roomId = "EXPIR1";
      const restoreStream = stubStream();
      const originalFetch = globalThis.fetch;
      const uploads: UploadedTransaction[] = [];
      let expired = false;
      const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/rooms")) return ownedRoom(roomId);
        if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
          const body = JSON.parse(String(init?.body)) as UploadedTransaction;
          if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
          uploads.push(body);
          if (expired) return roomGone();
          return timedOut();
        }
        if (url.includes(`/api/rooms/${roomId}/operations`)) {
          if (expired) return roomGone();
          return timedOut();
        }
        if (url.endsWith("/events-ticket")) {
          if (expired) return roomGone();
          return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        }
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);
        renameStudent(container, "林舟", "过期林舟");
        await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });
        // 上传超时是传输层失败:面板要说"仍在重试",而不是笼统的一个错误态。
        await vi.waitFor(() => expect(offlineBanner(container)).not.toBeNull(), { timeout: 5_000 });

        // 分区期间房间被清理:补齐拿到终局码,订阅永久停止。
        ScriptedEventSource.instances[0]!.onerror!();
        await vi.waitFor(() => expect(ScriptedEventSource.instances.length).toBeGreaterThan(1), { timeout: 5_000 });
        expired = true;
        ScriptedEventSource.instances[1]!.onerror!();
        await vi.waitFor(() => expect(expiredBanner(container)).not.toBeNull(), { timeout: 5_000 });

        // 终局房间没有任何可送达的事务:再发一笔只会拿回错误,把终局提示盖成"网络异常"。
        await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 4));
        expect(uploads).toHaveLength(1);
        expect(collaborationStatus(container)?.getAttribute("data-collaboration-terminal")).toBe("expired");
        expect(collaborationStatus(container)?.textContent).toContain("房间已过期或已失效");
        // 终局与离线互斥:不会再有重连,就不能继续承诺"恢复后自动续传"。
        expect(offlineBanner(container)).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });

    it("shows the offline banner for a submit-only partition and resends exactly once on heal", async () => {
      const container = renderApp();
      const roomId = "OFFLN1";
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
        renameStudent(container, "林舟", "半边分区林舟");
        await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });

        // 只有上传方向断了,流还是健康的:这一侧的失败同样属于离线,而不是"同步失败"。
        await vi.waitFor(() => expect(offlineBanner(container)).not.toBeNull(), { timeout: 5_000 });
        expect(collaborationStatus(container)?.textContent).toContain("网络异常，本地修改已保留，恢复后会自动续传");

        // 流上收到远端事件即为愈合:补投一次,且只补投一次。
        partitioned = false;
        ScriptedEventSource.instances[0]!.emit("snapshot", {
          id: roomId,
          version: 2,
          updatedBy: "c-remote",
          lastTxId: "tx-remote",
          operations: [{ type: "set", path: ["renderSettings", "fixedFps"], value: 45 }],
        });

        await vi.waitFor(() => expect(uploads).toHaveLength(2), { timeout: 5_000 });
        expect(uploads[1]!.baseVersion).toBe(2);
        expect(pathsOf(uploads[1]!)).toContain("project.students");
        await vi.waitFor(() => expect(offlineBanner(container)).toBeNull(), { timeout: 5_000 });
        await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 4));
        expect(uploads).toHaveLength(2);
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });

    it("keeps a version conflict out of the offline story", async () => {
      const container = renderApp();
      const roomId = "CONF03";
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
          return json({ error: { code: "VERSION_CONFLICT", message: "版本冲突", currentVersion: uploads.length + 1 } }, 409);
        }
        if (url.includes(`/api/rooms/${roomId}/operations`)) {
          return json({ id: roomId, version: 2, afterVersion: 1, operations: [{ type: "set", path: ["renderSettings", "fixedFps"], value: 45 }] });
        }
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);
        renameStudent(container, "林舟", "冲突不离线林舟");
        await vi.waitFor(() => expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("conflict"), { timeout: 5_000 });

        // 服务端明确拒绝,网络好得很:摆出离线态会让用户以为等一等就能自己上去。
        expect(offlineBanner(container)).toBeNull();
        expect(container.textContent).toContain("同一内容被其他成员修改");
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });
  });

  /**
   * 终局只从流那一侧落地时,提交被终局码拒掉的那一刻房间还是"活着"的样子:面板照旧显示
   * 已连接,送出 effect 下一次编辑照旧武装,用户会一直往一间死房里编辑,直到流自己发现过期。
   * 提交回执本身就是最早的终局证据,必须当场把房间带到终局。
   */
  describe("terminal submit rejection (R5-6)", () => {
    function offlineBanner(container: HTMLElement): HTMLElement | null {
      return container.querySelector<HTMLElement>('[data-collaboration-offline="true"]');
    }

    function expiredBanner(container: HTMLElement): HTMLElement | null {
      return container.querySelector<HTMLElement>('p[data-collaboration-terminal="expired"]');
    }

    it("lands the expired state from a submit rejection instead of waiting for the stream", async () => {
      const container = renderApp();
      const roomId = "GONE01";
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
          // 房间在两次编辑之间被清理:提交是本端第一个知道这件事的路径。
          return json({ error: { code: "ROOM_NOT_FOUND", message: "房间不存在" } }, 404);
        }
        // 流一直是健康的:终局不能靠它兜底,否则这段时间里的编辑全是白编。
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);
        renameStudent(container, "林舟", "死房林舟");
        await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });

        await vi.waitFor(() => expect(expiredBanner(container)).not.toBeNull(), { timeout: 5_000 });
        expect(collaborationStatus(container)?.getAttribute("data-collaboration-terminal")).toBe("expired");
        expect(collaborationStatus(container)?.textContent).toContain("房间已过期或已失效");
        // 拒绝的是协议层,网络好得很:摆出离线态等于承诺"恢复后自动续传",而这间房不会回来。
        expect(offlineBanner(container)).toBeNull();
        expect(ScriptedEventSource.instances).toHaveLength(1);

        // 送出 effect 不该再武装:再改一次也不会有第二笔注定失败的事务。
        renameStudent(container, "死房林舟", "死房林二");
        await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 4));
        expect(uploads).toHaveLength(1);
        expect(collaborationStatus(container)?.getAttribute("data-collaboration-terminal")).toBe("expired");
        // 失效的房间凭证不再留在本机,"加入"不会继续给出可点的假象。
        expect(window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${roomId}`)).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });

    it("closes the room from a submit rejection and stops re-arming the send effect", async () => {
      const container = renderApp();
      const roomId = "SHUT01";
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
          return json({ error: { code: "ROOM_CLOSED", message: "共享房间已关闭" } }, 409);
        }
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);
        renameStudent(container, "林舟", "关闭林舟");
        await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });

        await vi.waitFor(() => expect(collaborationStatus(container)?.getAttribute("data-collaboration-status")).toBe("closed"), { timeout: 5_000 });
        expect(container.textContent).toContain("房间已关闭");
        expect(offlineBanner(container)).toBeNull();

        await new Promise((resolve) => setTimeout(resolve, COLLABORATION_SEND_DELAY_MS * 4));
        expect(uploads).toHaveLength(1);
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });
  });

  /**
   * R6-6 让 ProjectMenu 有能力说出"这间房活不过服务端重启",但那句话只有在 App 把钩子的判断
   * 接到 prop 上时才会出现。缺了这根线,prop 的缺省值会让房里的人一直看不见警告。
   */
  describe("room persistence degradation wiring (R6-5b)", () => {
    const PERSIST_COPY = "该房间体量超过服务器持久化上限，服务器重启后将无法恢复，请及时导出备份";

    function persistNote(container: HTMLElement): HTMLElement | null {
      return container.querySelector<HTMLElement>('[data-collaboration-persist="degraded"]');
    }

    it("warns the room when the server reports it was skipped at the last flush", async () => {
      const container = renderApp();
      const roomId = "PRSST1";
      const restoreStream = stubStream();
      const originalFetch = globalThis.fetch;
      const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // 服务端上一次落盘跳过了这间房:create 响应把说法放在 room/access 的兄弟位置。
        if (url.endsWith("/api/rooms")) {
          const created = await ownedRoom(roomId).json();
          return json({ ...created, persistedAtLastFlush: false });
        }
        if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
          const body = JSON.parse(String(init?.body)) as UploadedTransaction;
          return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        }
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);

        const note = await vi.waitFor(() => {
          const node = persistNote(container);
          expect(node).not.toBeNull();
          return node!;
        }, { timeout: 5_000 });
        expect(note.textContent).toContain(PERSIST_COPY);
        // 纯展示态:房间照常同步,既没有终局也没有离线。
        expect(collaborationStatus(container)?.getAttribute("data-collaboration-terminal")).toBeNull();
        expect(container.querySelector('[data-collaboration-offline="true"]')).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });

    it("tells a trimmed room the snapshot survives a restart instead of repeating the death copy", async () => {
      const container = renderApp();
      const roomId = "PRSST2";
      const restoreStream = stubStream();
      const originalFetch = globalThis.fetch;
      const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // 上一次落盘是裁剪不是跳过:快照留下了,丢的只是增量历史。
        if (url.endsWith("/api/rooms")) {
          const created = await ownedRoom(roomId).json();
          return json({ ...created, persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: 1700000000500 } });
        }
        if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
          const body = JSON.parse(String(init?.body)) as UploadedTransaction;
          return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        }
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);

        const note = await vi.waitFor(() => {
          const node = persistNote(container);
          expect(node).not.toBeNull();
          return node!;
        }, { timeout: 5_000 });
        expect(note.getAttribute("data-collaboration-persist-kind")).toBe("trimmed");
        expect(note.textContent).not.toContain("服务器重启后将无法恢复");
        expect(note.textContent).toContain("重启后房间会恢复");
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });

    /**
     * 落盘连续失败期间三态报的还是上一次**成功**落盘,房间看上去一切正常——钩子把连击读了出来,
     * 但 App 少接一根线,房里的人就一直看不见"这段时间的改动可能丢失"。
     */
    it("warns the room while the server cannot write to disk", async () => {
      const container = renderApp();
      const roomId = "PRSST3";
      const restoreStream = stubStream();
      const originalFetch = globalThis.fetch;
      const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // 上一次成功落盘一切正常,连击只在 lastFailureAt 上:没有连击时服务端根本不发这个键。
        if (url.endsWith("/api/rooms")) {
          const created = await ownedRoom(roomId).json();
          return json({ ...created, persistence: { outcome: "persisted", at: 1700000000500, lastFailureAt: 1764000000900 } }, 201);
        }
        if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
          const body = JSON.parse(String(init?.body)) as UploadedTransaction;
          return json({ id: roomId, version: 1, ready: true, updatedBy: body.clientId, lastTxId: body.txId });
        }
        if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${ScriptedEventSource.instances.length}` }, 201);
        return json({});
      });
      globalThis.fetch = request as unknown as typeof fetch;
      try {
        await createRoomFromMenu(container);

        const failureNote = await vi.waitFor(() => {
          const node = container.querySelector<HTMLElement>('[data-collaboration-persist-failure="true"]');
          expect(node).not.toBeNull();
          return node!;
        }, { timeout: 5_000 });
        expect(failureNote.textContent).toContain("服务器暂时无法写入磁盘");
        // 纯展示态:房间照常同步,既没有终局也没有离线。
        expect(collaborationStatus(container)?.getAttribute("data-collaboration-terminal")).toBeNull();
        expect(container.querySelector('[data-collaboration-offline="true"]')).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
        restoreStream();
      }
    });
  });
});
