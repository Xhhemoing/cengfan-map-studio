// Split from src/App.test.tsx: opt-in incremental collaboration rooms
// (join/create, roles, readonly, closed states). Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import {
  changeInput,
  click,
  installAppTestHarness,
  renderApp,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App incremental collaboration rooms", () => {
  it("exposes opt-in incremental collaboration without connecting on startup", () => {
    const request = vi.spyOn(globalThis, "fetch");
    const container = renderApp();

    expect(container.querySelector('[aria-label="增量协作"]')).not.toBeNull();
    click(container.querySelector('[aria-label="增量协作"]')!);
    expect(container.textContent).toContain("未连接时不会上传或覆盖工程");
    expect(container.textContent).toContain("增量同步");
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining("/api/rooms"), expect.anything());
  });

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
      click(container.querySelector('[aria-label="增量协作"]')!);
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
      click(container.querySelector('[aria-label="增量协作"]')!);
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
      click(container.querySelector('[aria-label="增量协作"]')!);
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
      click(container.querySelector('[aria-label="增量协作"]')!);
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
});
