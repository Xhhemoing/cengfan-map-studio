// 从 src/App.test.tsx 原样搬出：协作房间角色与增量竞态：只读/成员/关闭房间与在途上传。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import { installAppTestHarness, renderApp, click, openRailAdvancedTab, openPeopleData, leaveFocusedWorkspace, changeInput } from "./app-test-harness";

installAppTestHarness();

describe("App student editing", () => {
  it("keeps edit actions disabled by viewer role through the shared commit boundary", async () => {
    const container = renderApp();
    const roomToken = "viewer-room-token";
    const roomId = "VIEW01";
    const remoteProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/rooms/${roomId}/join`)) {
        return new Response(JSON.stringify({ room: { id: roomId }, access: { accessToken: roomToken, role: "viewer", participantId: "viewer", id: "viewer", displayName: "查看者" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}`)) {
        return new Response(JSON.stringify({ id: roomId, version: 0, ready: true, snapshot: createProjectPackage({ project: remoteProject, assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 } }), role: "viewer", participants: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作房间码"]')!, roomId);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作邀请凭证"]')!, "viewer-invite");
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "加入")!);
      await vi.waitFor(() => expect(request).toHaveBeenCalledWith(`/api/rooms/${roomId}/join`, expect.anything()));
      await vi.waitFor(() => {
        expect(container.textContent).toContain("已加入房间");
        expect(window.localStorage.getItem(`cengfan-map-studio:room-access:${roomId}`)).toBe(roomToken);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shows room members with the owner marked and lets the owner toggle readonly", async () => {
    const container = renderApp();
    const roomId = "ROOM1";
    const originalEventSource = globalThis.EventSource;
    class QuietEventSource {
      addEventListener() {}
      onerror = null;
      close() {}
      constructor(public readonly url: string) {}
    }
    vi.stubGlobal("EventSource", QuietEventSource);
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/rooms")) {
        return new Response(JSON.stringify({
          room: { id: roomId, version: 0, ready: true, members: [{ clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t0" }] },
          access: { accessToken: "owner-token", role: "owner", participantId: "p1", id: "p1", displayName: "创建者" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
        return new Response(JSON.stringify({ id: roomId, version: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}/access`)) {
        return new Response(JSON.stringify({ id: roomId, version: 2, readonly: true, closed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "创建房间")!);
      await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/api/rooms", expect.anything()));
      await vi.waitFor(() => expect(container.textContent).toContain("房间已创建"));
      expect(container.querySelector('[aria-label="房间成员"]')).not.toBeNull();
      expect(container.textContent).toContain("创建者");
      expect(container.textContent).toContain("模式：可编辑");
      const readonlyButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "设为只读");
      expect(readonlyButton).toBeDefined();
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "关闭房间")).toBe(true);
      click(readonlyButton!);
      await vi.waitFor(() => expect(container.textContent).toContain("模式：只读"));
      const accessCall = request.mock.calls.find(([input]) => String(input).endsWith(`/api/rooms/${roomId}/access`));
      expect(accessCall?.[1]).toMatchObject({ method: "POST" });
      expect(JSON.parse((accessCall?.[1] as RequestInit).body as string)).toMatchObject({ action: "set-readonly" });
      expect(typeof JSON.parse((accessCall?.[1] as RequestInit).body as string).clientId).toBe("string");
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
      globalThis.EventSource = originalEventSource;
    }
  });

  it("shows readonly mode to editors without exposing owner-only controls", async () => {
    const container = renderApp();
    const roomId = "VIEW02";
    const originalEventSource = globalThis.EventSource;
    class QuietEventSource {
      addEventListener() {}
      onerror = null;
      close() {}
      constructor(public readonly url: string) {}
    }
    vi.stubGlobal("EventSource", QuietEventSource);
    const remoteProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/rooms/${roomId}/join`)) {
        return new Response(JSON.stringify({ room: { id: roomId }, access: { accessToken: "editor-token", role: "editor", participantId: "editor", id: "editor", displayName: "编辑者" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}`)) {
        return new Response(JSON.stringify({
          id: roomId,
          version: 1,
          ready: true,
          snapshot: createProjectPackage({ project: remoteProject, assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 } }),
          role: "editor",
          readonly: true,
          closed: false,
          members: [
            { clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t1" },
            { clientId: "c-editor", role: "editor", joinedAt: "t1", lastSeenAt: "t1" },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作房间码"]')!, roomId);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作邀请凭证"]')!, "editor-invite");
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "加入")!);
      await vi.waitFor(() => expect(container.textContent).toContain("已加入房间"));
      expect(container.textContent).toContain("模式：只读");
      expect(container.textContent).toContain("房间为只读模式");
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "设为只读")).toBe(false);
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "关闭房间")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
      globalThis.EventSource = originalEventSource;
    }
  });

  it("shows a closed room as closed and hides every room control", async () => {
    const container = renderApp();
    const roomId = "VIEW03";
    const originalEventSource = globalThis.EventSource;
    class QuietEventSource {
      addEventListener() {}
      onerror = null;
      close() {}
      constructor(public readonly url: string) {}
    }
    vi.stubGlobal("EventSource", QuietEventSource);
    const remoteProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    const originalFetch = globalThis.fetch;
    const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/rooms/${roomId}/join`)) {
        return new Response(JSON.stringify({ room: { id: roomId }, access: { accessToken: "editor-token", role: "editor", participantId: "editor", id: "editor", displayName: "编辑者" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith(`/api/rooms/${roomId}`)) {
        return new Response(JSON.stringify({
          id: roomId,
          version: 1,
          ready: true,
          snapshot: createProjectPackage({ project: remoteProject, assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 } }),
          role: "editor",
          readonly: true,
          closed: true,
          members: [{ clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t0" }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/events-ticket")) return new Response(JSON.stringify({ ticket: "ticket" }), { status: 201, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = request as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作房间码"]')!, roomId);
      changeInput(container.querySelector<HTMLInputElement>('[aria-label="协作邀请凭证"]')!, "editor-invite");
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "加入")!);
      await vi.waitFor(() => expect(container.textContent).toContain("模式：已关闭"));
      expect(container.textContent).toContain("房间已关闭");
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "设为只读")).toBe(false);
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "关闭房间")).toBe(false);
      expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "邀请编辑者")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
      globalThis.EventSource = originalEventSource;
    }
  });

  it("keeps a baseline advanced by a remote event while an incremental upload is in flight", async () => {
    const container = renderApp();
    const roomId = "RACE01";
    const originalEventSource = globalThis.EventSource;
    const streams: RaceEventSource[] = [];
    class RaceEventSource {
      listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
      onerror: (() => void) | null = null;
      closed = false;
      constructor(public readonly url: string) {
        streams.push(this as unknown as RaceEventSource);
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
        flushSync(() => {
          for (const handler of this.listeners.get(type) ?? []) handler({ data: JSON.stringify(data) } as MessageEvent<string>);
        });
      }
    }
    vi.stubGlobal("EventSource", RaceEventSource);
    const originalFetch = globalThis.fetch;
    const uploads: { baseVersion: number; operations: { type: string; path: string[] }[] }[] = [];
    const backfills: string[] = [];
    let releaseFirstUpload: (() => void) | null = null;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/rooms")) {
        return json({
          room: { id: roomId, version: 0, ready: true, members: [{ clientId: "c-owner", role: "owner", joinedAt: "t0", lastSeenAt: "t0" }] },
          access: { accessToken: "owner-token", role: "owner", participantId: "p1", id: "p1", displayName: "创建者" },
        });
      }
      if (url.endsWith(`/api/rooms/${roomId}/transactions`)) {
        const body = JSON.parse(String(init?.body)) as { snapshot?: unknown; baseVersion: number; operations?: { type: string; path: string[] }[] };
        if (body.snapshot) return json({ id: roomId, version: 1, ready: true, updatedBy: "c-owner", lastTxId: "init" });
        uploads.push({ baseVersion: body.baseVersion, operations: body.operations ?? [] });
        if (uploads.length > 1) return json({ id: roomId, version: 4, ready: true });
        // Hold the first incremental upload open so a remote event can land mid-flight.
        return new Promise<Response>((resolve) => {
          releaseFirstUpload = () => resolve(json({ id: roomId, version: 3, ready: true }));
        });
      }
      if (url.includes(`/api/rooms/${roomId}/operations`)) {
        backfills.push(url);
        return json({ id: roomId, version: 3, afterVersion: 1, operations: [] });
      }
      if (url.endsWith("/events-ticket")) return json({ ticket: `ticket-${streams.length}` }, 201);
      return json({});
    });
    globalThis.fetch = request as unknown as typeof fetch;
    try {
      click(container.querySelector('[aria-label="增量在线协作"]')!);
      click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "创建房间")!);
      await vi.waitFor(() => expect(container.textContent).toContain("房间已创建"));
      await vi.waitFor(() => expect(streams.length).toBe(1));

      openPeopleData(container);
      click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
      changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "并发林舟");
      click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);
      await vi.waitFor(() => expect(uploads).toHaveLength(1), { timeout: 5_000 });
      expect(uploads[0]!.baseVersion).toBe(1);

      // Another member's transaction lands while our upload is still in flight.
      streams[0]!.emit("snapshot", {
        id: roomId,
        version: 2,
        updatedBy: "c-remote",
        operations: [{ type: "set", path: ["renderSettings", "fixedFps"], value: 45 }],
      });
      releaseFirstUpload!();
      leaveFocusedWorkspace(container);
      openRailAdvancedTab(container);
      await vi.waitFor(() => expect(container.textContent).toContain("增量同步已完成"));

      openPeopleData(container);
      click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 并发林舟"]')!);
      changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "并发林舟二");
      click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 并发林舟"]')!);
      await vi.waitFor(() => expect(uploads).toHaveLength(2), { timeout: 5_000 });

      // The remote change must stay in the baseline: re-uploading it would mean the
      // acknowledgement clobbered a baseline that the remote event already advanced.
      expect(uploads[1]!.operations.map((operation) => operation.path.join("."))).not.toContain("renderSettings.fixedFps");
      // The acknowledged version must not regress below the remote event, or the next
      // event would look like a gap and force a redundant interval backfill.
      expect(uploads[1]!.baseVersion).toBe(3);
      expect(backfills).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
      globalThis.EventSource = originalEventSource;
    }
  });
});
