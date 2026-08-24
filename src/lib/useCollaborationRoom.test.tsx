import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ROOM_ACCESS_STORAGE_PREFIX } from "./app-constants";
import type { CollaborationOperation } from "./collaboration-operations";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import { useCollaborationRoom, type UseCollaborationRoomResult } from "./useCollaborationRoom";

const ROOM_ID = "ROOM01";
const ROOM_TOKEN = "member-token";

class FakeEventSource {
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
    flushSync(() => {
      for (const handler of this.listeners.get(type) ?? []) handler({ data: JSON.stringify(data) } as MessageEvent<string>);
    });
  }
  fail(): void {
    flushSync(() => this.onerror?.());
  }
  static live(): FakeEventSource[] {
    return FakeEventSource.instances.filter((instance) => !instance.closed);
  }
}

function samplePackage(fixedFps = 20, mode: "normal" | "low" = "normal"): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: { mode, fixedFps },
  });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

interface Harness {
  controller: () => UseCollaborationRoomResult;
  refs: {
    baselineRef: { current: ProjectPackage | null };
    versionRef: { current: number };
    roomRef: { current: string | null };
    accessTokenRef: { current: string | null };
    suppressSendRef: { current: boolean };
    backfillInFlightRef: { current: boolean };
  };
  applied: { version: number; pack: ProjectPackage }[];
  unmount: () => void;
}

function mountHook(initial: ProjectPackage): Harness {
  const refs = {
    baselineRef: { current: null as ProjectPackage | null },
    versionRef: { current: 0 },
    roomRef: { current: null as string | null },
    accessTokenRef: { current: null as string | null },
    suppressSendRef: { current: false },
    backfillInFlightRef: { current: false },
  };
  const applied: { version: number; pack: ProjectPackage }[] = [];
  let live = initial;
  let controller: UseCollaborationRoomResult | null = null;

  function Harnessed(): null {
    controller = useCollaborationRoom({
      clientId: "c-local",
      currentPackage: (exportedAt) => (exportedAt === undefined ? live : { ...live, exportedAt }),
      applyPackage: (pack, version) => {
        live = pack;
        applied.push({ version, pack });
        return pack;
      },
      ...refs,
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  flushSync(() => root.render(<Harnessed />));
  return {
    controller: () => controller!,
    refs,
    applied,
    unmount: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}

interface ServerScript {
  snapshotVersion: number;
  snapshot: ProjectPackage;
  operations: (afterVersion: number) => Response;
  room?: () => Response;
}

function installFetch(script: ServerScript): MockInstance {
  const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith(`/api/rooms/${ROOM_ID}/events-ticket`)) {
      return json({ ticket: `ticket-${FakeEventSource.instances.length}` }, 201);
    }
    if (url.includes(`/api/rooms/${ROOM_ID}/operations`)) {
      const afterVersion = Number(new URLSearchParams(url.split("?")[1] ?? "").get("afterVersion"));
      return script.operations(afterVersion);
    }
    if (url.endsWith(`/api/rooms/${ROOM_ID}`)) {
      return script.room?.() ?? json({ id: ROOM_ID, version: script.snapshotVersion, ready: true, snapshot: script.snapshot, role: "editor", members: [] });
    }
    return json({});
  });
  globalThis.fetch = request as unknown as typeof fetch;
  return request as unknown as MockInstance;
}

async function joinRoom(harness: Harness): Promise<void> {
  window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
  flushSync(() => harness.controller().setRoomInput(ROOM_ID));
  harness.controller().joinRoom();
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
}

const setOp = (path: string[], value: unknown): CollaborationOperation => ({ type: "set", path, value });

describe("useCollaborationRoom", () => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    FakeEventSource.instances = [];
    window.localStorage.clear();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    globalThis.EventSource = originalEventSource;
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
  });

  it("applies a contiguous operations event in place", async () => {
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => json({ error: { code: "VERSION_CONFLICT", message: "不应发生" } }, 409),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

    FakeEventSource.instances[0]!.emit("snapshot", {
      id: ROOM_ID,
      version: 2,
      operations: [setOp(["renderSettings", "fixedFps"], 42)],
    });

    expect(harness.refs.versionRef.current).toBe(2);
    expect(harness.refs.baselineRef.current?.renderSettings.fixedFps).toBe(42);
    expect(harness.controller().roomVersion).toBe(2);
    harness.unmount();
  });

  it("never partial-applies a version gap and backfills the missing interval instead", async () => {
    const request = installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({
        id: ROOM_ID,
        version: 3,
        afterVersion,
        operations: [
          setOp(["renderSettings", "mode"], "low"),
          setOp(["renderSettings", "fixedFps"], 55),
        ],
      }),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

    // v2 never reached this client: applying the v3 payload directly would drop it.
    FakeEventSource.instances[0]!.emit("snapshot", {
      id: ROOM_ID,
      version: 3,
      operations: [setOp(["renderSettings", "fixedFps"], 55)],
    });

    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(3));
    const operationsCall = request.mock.calls.find(([input]) => String(input).includes("/operations?"));
    expect(String(operationsCall?.[0])).toContain("afterVersion=1");
    expect(harness.refs.baselineRef.current?.renderSettings).toMatchObject({ mode: "low", fixedFps: 55 });
    harness.unmount();
  });

  it("discards a backfill interval whose version is not newer than the local version", async () => {
    const request = installFetch({
      snapshotVersion: 5,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({
        id: ROOM_ID,
        version: 3,
        afterVersion,
        operations: [setOp(["renderSettings", "fixedFps"], 7)],
      }),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(5));
    const appliedBefore = harness.applied.length;

    FakeEventSource.instances[0]!.fail();

    await vi.waitFor(() => expect(request.mock.calls.some(([input]) => String(input).includes("/operations?"))).toBe(true));
    await vi.waitFor(() => expect(harness.refs.backfillInFlightRef.current).toBe(false));
    expect(harness.refs.versionRef.current).toBe(5);
    expect(harness.refs.baselineRef.current?.renderSettings.fixedFps).toBe(20);
    expect(harness.applied).toHaveLength(appliedBefore);
    harness.unmount();
  });

  it("mints a fresh events ticket and keeps exactly one stream through a reconnect storm", async () => {
    vi.useFakeTimers();
    const request = installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    for (let round = 0; round < 5; round += 1) {
      expect(FakeEventSource.live()).toHaveLength(1);
      FakeEventSource.live()[0]!.fail();
      expect(FakeEventSource.live()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(20_000);
      await vi.waitUntil(() => FakeEventSource.instances.length === round + 2, { timeout: 2_000, interval: 1 });
    }

    const ticketCalls = request.mock.calls.filter(([input]) => String(input).endsWith("/events-ticket"));
    expect(ticketCalls).toHaveLength(6);
    expect(FakeEventSource.live()).toHaveLength(1);
    // Every reconnect resumes from the version this client actually holds.
    expect(FakeEventSource.live()[0]!.url).toContain("version=1");
    expect(new Set(FakeEventSource.instances.map((instance) => instance.url)).size).toBe(6);

    harness.unmount();
    expect(FakeEventSource.live()).toHaveLength(0);
  });

  it("stops reconnecting once a closed event arrives", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.emit("closed", { id: ROOM_ID, version: 2, readonly: true, closed: true });
    expect(harness.controller().roomClosed).toBe(true);
    expect(harness.controller().collaborationStatus).toBe("closed");

    FakeEventSource.instances[0]!.fail();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    harness.unmount();
  });

  it("terminates the reconnect loop when the backfill discovers the room is closed", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => json({ error: { code: "ROOM_CLOSED", message: "共享房间已关闭" } }, 409),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.fail();
    await vi.waitUntil(() => harness.controller().roomClosed, { timeout: 2_000, interval: 1 });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(harness.controller().collaborationStatus).toBe("closed");
    harness.unmount();
  });
});
