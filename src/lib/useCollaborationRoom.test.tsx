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
  operations: (afterVersion: number) => Response | Promise<Response>;
  room?: () => Response | Promise<Response>;
  /** 第几次申请 events ticket(从 0 起)。房间被清理后 ticket 会开始报终局码。 */
  ticket?: (attempt: number) => Response | Promise<Response>;
  /** `POST /api/rooms`:R6-2 起 201 的 body 里带 `persistedAtLastFlush` 兄弟字段。 */
  create?: () => Response | Promise<Response>;
  /** `POST /api/rooms/:id/join`:同上,200 的 body 里带同一个兄弟字段。 */
  join?: () => Response | Promise<Response>;
}

const createdRoomBody = (extra: Record<string, unknown> = {}) => ({
  room: { id: ROOM_ID, version: 0, ready: true },
  access: { id: "p-owner", participantId: "p-owner", displayName: "创建者", role: "owner", accessToken: ROOM_TOKEN },
  ...extra,
});

const joinedRoomBody = (extra: Record<string, unknown> = {}) => ({
  room: { id: ROOM_ID, version: 0, ready: true },
  access: { id: "p-member", participantId: "p-member", displayName: "成员", role: "editor", accessToken: ROOM_TOKEN },
  ...extra,
});

function installFetch(script: ServerScript): MockInstance {
  let ticketAttempts = 0;
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requestSignals.push({ url, signal: init?.signal ?? undefined });
    if (url.endsWith(`/api/rooms/${ROOM_ID}/events-ticket`)) {
      const attempt = ticketAttempts;
      ticketAttempts += 1;
      if (script.ticket) return script.ticket(attempt);
      return json({ ticket: `ticket-${FakeEventSource.instances.length}` }, 201);
    }
    if (url.endsWith("/api/rooms")) {
      return script.create?.() ?? json(createdRoomBody(), 201);
    }
    if (url.endsWith(`/api/rooms/${ROOM_ID}/join`)) {
      return script.join?.() ?? json(joinedRoomBody());
    }
    if (url.endsWith(`/api/rooms/${ROOM_ID}/transactions`)) {
      return json({ id: ROOM_ID, version: script.snapshotVersion, ready: true, updatedBy: "c-local", lastTxId: "tx-init" });
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

/** 每次请求拿到的取消信号,用来断言离开房间/卸载时在途请求确实被中止。 */
let requestSignals: { url: string; signal?: AbortSignal }[] = [];

/** 网络分区:请求发出去了,响应永远不来。 */
const neverSettles = (): Promise<Response> => new Promise<Response>(() => {});

async function joinRoom(harness: Harness): Promise<void> {
  window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
  flushSync(() => harness.controller().setRoomInput(ROOM_ID));
  harness.controller().joinRoom();
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
}

/** 邀请凭证路径:本机没有存过凭证,所以握手真的会走一次 `POST /api/rooms/:id/join`。 */
async function joinRoomWithInvite(harness: Harness): Promise<void> {
  flushSync(() => {
    harness.controller().setRoomInput(ROOM_ID);
    harness.controller().setInviteTokenInput("invite-token");
  });
  harness.controller().joinRoom();
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
}

const setOp = (path: string[], value: unknown): CollaborationOperation => ({ type: "set", path, value });

describe("useCollaborationRoom", () => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    FakeEventSource.instances = [];
    requestSignals = [];
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

  it("reports a distinct offline state when the join request never settles, then recovers", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
      room: () => neverSettles(),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => harness.controller().collaborationStatus === "connecting", { timeout: 2_000, interval: 1 });

    // 分区期间服务端永不回包:没有截止时间的话这里会永远停在"正在恢复房间访问"。
    await vi.advanceTimersByTimeAsync(120_000);
    await vi.waitUntil(() => harness.controller().collaborationOffline, { timeout: 2_000, interval: 1 });
    expect(harness.controller().collaborationStatus).toBe("error");
    expect(harness.controller().collaborationMessage).toContain("网络");
    expect(requestSignals.some((call) => call.url.endsWith(`/api/rooms/${ROOM_ID}`) && call.signal?.aborted)).toBe(true);

    installFetch({
      snapshotVersion: 4,
      snapshot: samplePackage(30),
      operations: (afterVersion) => json({ id: ROOM_ID, version: 4, afterVersion, operations: [] }),
    });
    harness.controller().joinRoom();
    await vi.waitUntil(() => !harness.controller().collaborationOffline, { timeout: 2_000, interval: 1 });
    expect(harness.controller().collaborationStatus).toBe("connected");
    expect(harness.refs.versionRef.current).toBe(4);
    harness.unmount();
  });

  it("aborts an in-flight backfill when the room subscription tears down", async () => {
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => neverSettles(),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));
    const appliedBefore = harness.applied.length;

    FakeEventSource.instances[0]!.fail();
    await vi.waitFor(() => expect(requestSignals.some((call) => call.url.includes("/operations"))).toBe(true));
    const backfill = requestSignals.find((call) => call.url.includes("/operations"));
    expect(harness.refs.backfillInFlightRef.current).toBe(true);

    harness.unmount();

    expect(backfill?.signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(harness.refs.backfillInFlightRef.current).toBe(false));
    expect(harness.applied).toHaveLength(appliedBefore);
  });

  it("goes offline while the backfill cannot reach the server and clears it on the next event", async () => {
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

    FakeEventSource.instances[0]!.fail();
    await vi.waitFor(() => expect(harness.controller().collaborationOffline).toBe(true), { timeout: 5_000 });
    expect(harness.controller().collaborationStatus).toBe("error");

    // 自持重连挂上新流后,第一条事件就把离线态清掉。
    await vi.waitFor(() => expect(FakeEventSource.live()).toHaveLength(1), { timeout: 5_000 });
    FakeEventSource.live()[0]!.emit("snapshot", {
      id: ROOM_ID,
      version: 2,
      operations: [setOp(["renderSettings", "fixedFps"], 33)],
    });

    expect(harness.controller().collaborationOffline).toBe(false);
    expect(harness.controller().collaborationStatus).toBe("connected");
    // 离线 → 在线的跳变对外可观测:调用方据此重发分区期间没能上传的修改。
    expect(harness.controller().connectionHealCount).toBe(1);
    expect(harness.refs.versionRef.current).toBe(2);
    harness.unmount();
  });

  it("enters a terminal expired state when the backfill finds the room gone", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => json({ error: { code: "ROOM_NOT_FOUND", message: "共享房间不存在" } }, 404),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.fail();
    await vi.waitUntil(() => harness.controller().roomExpired, { timeout: 2_000, interval: 1 });

    // 房间已经不存在:既不是"离线"(等网络回来也没用),也不能再承诺自动重连。
    expect(harness.controller().collaborationOffline).toBe(false);
    expect(harness.controller().collaborationMessage).toContain("房间已过期");
    expect(harness.controller().collaborationMessage).not.toContain("正在自动重连");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    // 失效的房间凭证不再留在本机,"加入"不会继续给出可点的假象。
    expect(window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`)).toBeNull();
    harness.unmount();
  });

  it("enters the terminal state when the reconnect ticket reports the room is gone", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      // 房间被清理时补齐请求也可能一直悬着:终局判定必须来自 ticket,而不是靠补齐兜底。
      operations: () => neverSettles(),
      ticket: (attempt) => (attempt === 0
        ? json({ ticket: "ticket-0" }, 201)
        : json({ error: { code: "ROOM_NOT_FOUND", message: "共享房间不存在" } }, 404)),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.fail();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitUntil(() => harness.controller().roomExpired, { timeout: 2_000, interval: 1 });

    expect(harness.controller().collaborationStatus).toBe("error");
    expect(harness.controller().collaborationMessage).toContain("房间已过期");
    expect(harness.controller().collaborationOffline).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    harness.unmount();
  });

  it("nudges an immediate reconnect and backfill when the browser reports the network is back", async () => {
    vi.useFakeTimers();
    let reachable = false;
    const request = installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => {
        if (!reachable) throw new TypeError("Failed to fetch");
        return json({
          id: ROOM_ID,
          version: 2,
          afterVersion,
          operations: [setOp(["renderSettings", "fixedFps"], 44)],
        });
      },
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });
    await vi.waitUntil(() => harness.refs.versionRef.current === 1, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.fail();
    await vi.waitUntil(() => harness.controller().collaborationOffline, { timeout: 2_000, interval: 1 });
    const streamsWhileOffline = FakeEventSource.instances.length;
    const ticketsWhileOffline = request.mock.calls.filter(([input]) => String(input).endsWith("/events-ticket")).length;

    reachable = true;
    flushSync(() => window.dispatchEvent(new Event("online")));
    // 一毫秒的退避都不等:恢复的那一刻就重挂流并补齐。
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls.filter(([input]) => String(input).endsWith("/events-ticket")).length)
      .toBe(ticketsWhileOffline + 1);

    await vi.waitUntil(() => harness.refs.versionRef.current === 2, { timeout: 2_000, interval: 1 });
    expect(FakeEventSource.instances.length).toBeGreaterThan(streamsWhileOffline);
    expect(FakeEventSource.live()).toHaveLength(1);
    expect(harness.controller().collaborationOffline).toBe(false);
    expect(harness.controller().connectionHealCount).toBe(1);
    expect(harness.refs.baselineRef.current?.renderSettings.fixedFps).toBe(44);
    harness.unmount();
  });

  it("never resurrects a terminal room from an online event", async () => {
    vi.useFakeTimers();
    const request = installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => json({ error: { code: "ROOM_NOT_FOUND", message: "共享房间不存在" } }, 404),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.fail();
    await vi.waitUntil(() => harness.controller().roomExpired, { timeout: 2_000, interval: 1 });
    const callsWhenExpired = request.mock.calls.length;

    flushSync(() => window.dispatchEvent(new Event("online")));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(request.mock.calls).toHaveLength(callsWhenExpired);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(harness.controller().collaborationMessage).toContain("房间已过期");
    harness.unmount();
  });

  it("folds a caller-reported transport failure into the same offline story", async () => {
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

    // 上传路径(事务提交)在调用方那一侧,它的分区失败要并进同一个离线叙事。
    flushSync(() => harness.controller().setCollaborationOffline(true));
    expect(harness.controller().collaborationOffline).toBe(true);
    expect(harness.controller().collaborationStatus).toBe("error");
    expect(harness.controller().collaborationMessage).toContain("网络已断开");
    expect(harness.controller().connectionHealCount).toBe(0);

    flushSync(() => harness.controller().setCollaborationOffline(false));
    expect(harness.controller().collaborationOffline).toBe(false);
    expect(harness.controller().connectionHealCount).toBe(1);
    // 已经在线时再报一次在线不算恢复,调用方不会因此重发第二遍。
    flushSync(() => harness.controller().setCollaborationOffline(false));
    expect(harness.controller().connectionHealCount).toBe(1);
    harness.unmount();
  });

  it("keeps the terminal state out of reach of a caller-reported offline flag", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => json({ error: { code: "ROOM_NOT_FOUND", message: "共享房间不存在" } }, 404),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.fail();
    await vi.waitUntil(() => harness.controller().roomExpired, { timeout: 2_000, interval: 1 });

    flushSync(() => harness.controller().setCollaborationOffline(true));

    expect(harness.controller().collaborationOffline).toBe(false);
    expect(harness.controller().collaborationMessage).toContain("房间已过期");
    harness.unmount();
  });

  /**
   * 上传路径在调用方那一侧,它拿到的终局码是本端最早的终局证据。没有这个入口,调用方只能
   * 画一句错误文案,房间在面板上继续活着,用户会一直往一间死房里编辑。
   */
  describe("reportTerminalRejection", () => {
    async function connected(): Promise<Harness> {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
      });
      const harness = mountHook(samplePackage());
      await joinRoom(harness);
      await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));
      return harness;
    }

    it("lands the expired state and forgets the dead room credential", async () => {
      const harness = await connected();

      expect(flushSync(() => harness.controller().reportTerminalRejection("ROOM_NOT_FOUND"))).toBe(true);

      expect(harness.controller().roomExpired).toBe(true);
      expect(harness.controller().collaborationStatus).toBe("error");
      expect(harness.controller().collaborationMessage).toContain("房间已过期");
      // 协议层拒绝不是分区:既不摆离线态,也不算一次愈合——愈合会让调用方立刻再投一笔。
      expect(harness.controller().collaborationOffline).toBe(false);
      expect(harness.controller().connectionHealCount).toBe(0);
      expect(window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`)).toBeNull();
      harness.unmount();
    });

    it("maps a forbidden rejection onto the same expired narrative", async () => {
      const harness = await connected();

      flushSync(() => harness.controller().reportTerminalRejection("ROOM_FORBIDDEN"));

      expect(harness.controller().roomExpired).toBe(true);
      expect(harness.controller().collaborationMessage).toContain("凭证已失效");
      expect(harness.controller().collaborationOffline).toBe(false);
      harness.unmount();
    });

    it("closes the room for a closed rejection", async () => {
      const harness = await connected();

      flushSync(() => harness.controller().reportTerminalRejection("ROOM_CLOSED"));

      expect(harness.controller().roomClosed).toBe(true);
      expect(harness.controller().collaborationStatus).toBe("closed");
      expect(harness.controller().canEdit).toBe(false);
      expect(harness.controller().connectionHealCount).toBe(0);
      harness.unmount();
    });

    it("keeps the first terminal cause when later rejections pile up", async () => {
      const harness = await connected();

      flushSync(() => harness.controller().reportTerminalRejection("ROOM_NOT_FOUND"));
      // 在途的第二笔事务会带回另一个终局码:成因是第一个,后到的不该改写提示。
      expect(flushSync(() => harness.controller().reportTerminalRejection("ROOM_CLOSED"))).toBe(true);
      flushSync(() => harness.controller().reportTerminalRejection("ROOM_NOT_FOUND"));

      expect(harness.controller().roomExpired).toBe(true);
      expect(harness.controller().roomClosed).toBe(false);
      expect(harness.controller().collaborationStatus).toBe("error");
      expect(harness.controller().collaborationMessage).toContain("房间已过期");
      expect(harness.controller().connectionHealCount).toBe(0);
      harness.unmount();
    });

    it("leaves non-terminal rejections to the caller", async () => {
      const harness = await connected();

      expect(flushSync(() => harness.controller().reportTerminalRejection("VERSION_CONFLICT"))).toBe(false);
      expect(flushSync(() => harness.controller().reportTerminalRejection("REQUEST_TIMEOUT"))).toBe(false);

      // 冲突要靠补齐重投,超时属于离线叙事:两者都不能被当成终局把房间掐掉。
      expect(harness.controller().roomExpired).toBe(false);
      expect(harness.controller().roomClosed).toBe(false);
      expect(harness.controller().collaborationStatus).toBe("connected");
      harness.unmount();
    });
  });

  /**
   * 房间是否能挺过一次服务端重启,只有服务端知道(R6-2 的 `persistedAtLastFlush`)。房里的人
   * 是唯一会因此丢数据的人,所以这个判断必须变成一份能渲染的状态。它是纯展示态:不碰重连、
   * 补齐、离线与终局的任何判据。
   */
  describe("roomPersistenceDegraded", () => {
    it("marks the room degraded when the join handshake reports it was skipped at the last flush", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: false })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

      expect(harness.controller().roomPersistenceDegraded).toBe(true);
      // 纯展示态:既不是离线,也不是终局,连接照常。
      expect(harness.controller().collaborationOffline).toBe(false);
      expect(harness.controller().roomExpired).toBe(false);
      expect(harness.controller().collaborationStatus).toBe("connected");
      harness.unmount();
    });

    it("lets the newer snapshot overrule a healthy join handshake", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: true })),
        // 握手与快照之间又落了一次盘,这一次房间被裁掉了:后到的说法才是当前的处境。
        room: () => json({ id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [], persistedAtLastFlush: false }),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);

      await vi.waitFor(() => expect(harness.controller().roomPersistenceDegraded).toBe(true));
      harness.unmount();
    });

    it("stays quiet for a healthy room and for a server that never reports the flag", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: true })),
        room: () => json({ id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [], persistedAtLastFlush: true }),
      });
      const healthy = mountHook(samplePackage());
      await joinRoomWithInvite(healthy);
      await vi.waitFor(() => expect(healthy.refs.versionRef.current).toBe(1));
      expect(healthy.controller().roomPersistenceDegraded).toBe(false);
      healthy.unmount();

      FakeEventSource.instances = [];
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
      });
      const silent = mountHook(samplePackage());
      await joinRoomWithInvite(silent);
      await vi.waitFor(() => expect(silent.refs.versionRef.current).toBe(1));
      // 旧服务端没有说法:不能替它宣布房间活不过重启。
      expect(silent.controller().roomPersistenceDegraded).toBe(false);
      silent.unmount();
    });

    it("marks a freshly created room degraded from the create response", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        create: () => json(createdRoomBody({ persistedAtLastFlush: false }), 201),
      });
      const harness = mountHook(samplePackage());
      harness.controller().startRoom();

      await vi.waitFor(() => expect(harness.controller().roomPersistenceDegraded).toBe(true));
      expect(harness.controller().collaborationStatus).toBe("connected");
      harness.unmount();
    });

    it("never lets a degraded room stain the next room or the disconnected panel", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: false })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.controller().roomPersistenceDegraded).toBe(true));

      flushSync(() => harness.controller().leaveRoom());
      expect(harness.controller().roomPersistenceDegraded).toBe(false);

      // 下一间房是健康的:上一间的降级不能跟过来。
      FakeEventSource.instances = [];
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        create: () => json(createdRoomBody({ persistedAtLastFlush: true }), 201),
      });
      harness.controller().startRoom();
      await vi.waitFor(() => expect(harness.controller().roomId).toBe(ROOM_ID));
      expect(harness.controller().roomPersistenceDegraded).toBe(false);
      harness.unmount();
    });
  });

  /**
   * 布尔位只说得出"没能完整写下",说不出后果:被跳过的房间重启后不会回来,被裁剪的房间连
   * 快照带版本都还在,丢的只是增量历史。两者要给房里的人两种不同的交代,所以 R7-2 的
   * `persistence.outcome` 也要变成一份能渲染的状态。同样是纯展示态。
   */
  describe("roomPersistenceKind", () => {
    it("tells a trimmed room apart from a skipped one", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: 1_764_000_000_000 } })),
      });
      const trimmed = mountHook(samplePackage());
      await joinRoomWithInvite(trimmed);
      await vi.waitFor(() => expect(trimmed.refs.versionRef.current).toBe(1));

      expect(trimmed.controller().roomPersistenceKind).toBe("trimmed");
      // 布尔位对两种降级一视同仁:接线方据此显示提示,文案由 kind 决定。
      expect(trimmed.controller().roomPersistenceDegraded).toBe(true);
      // 纯展示态:既不是离线,也不是终局,连接照常。
      expect(trimmed.controller().collaborationOffline).toBe(false);
      expect(trimmed.controller().roomExpired).toBe(false);
      expect(trimmed.controller().collaborationStatus).toBe("connected");
      trimmed.unmount();

      FakeEventSource.instances = [];
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        create: () => json(createdRoomBody({ persistedAtLastFlush: false, persistence: { outcome: "skipped", at: null } }), 201),
      });
      const skipped = mountHook(samplePackage());
      skipped.controller().startRoom();

      await vi.waitFor(() => expect(skipped.controller().roomPersistenceKind).toBe("skipped"));
      expect(skipped.controller().roomPersistenceDegraded).toBe(true);
      skipped.unmount();
    });

    it("reports a healthy room as persisted", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000 } })),
        room: () => json({ id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [], persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000 } }),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

      expect(harness.controller().roomPersistenceKind).toBe("persisted");
      expect(harness.controller().roomPersistenceDegraded).toBe(false);
      harness.unmount();
    });

    it("has no verdict for a boolean-only server", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: false })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.controller().roomPersistenceDegraded).toBe(true));

      // 只认布尔的服务端没说是哪一种降级:不能替它猜,接线方据此沿用原来的说法。
      expect(harness.controller().roomPersistenceKind).toBeNull();
      harness.unmount();
    });

    it("keeps the last verdict when a later response says nothing about the outcome", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: 1_764_000_000_000 } })),
        // 握手说了裁剪,随后的快照只带布尔位:房间没有因此忽然变成"重启后不会回来"。
        room: () => json({ id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [], persistedAtLastFlush: false }),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

      expect(harness.controller().roomPersistenceKind).toBe("trimmed");
      expect(harness.controller().roomPersistenceDegraded).toBe(true);
      harness.unmount();
    });

    it("lets the newer snapshot overrule the handshake verdict", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000 } })),
        room: () => json({ id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [], persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: 1_764_000_000_001 } }),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);

      await vi.waitFor(() => expect(harness.controller().roomPersistenceKind).toBe("trimmed"));
      expect(harness.controller().roomPersistenceDegraded).toBe(true);
      harness.unmount();
    });

    it("never lets one room's outcome stain the next room or the disconnected panel", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: 1_764_000_000_000 } })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.controller().roomPersistenceKind).toBe("trimmed"));

      flushSync(() => harness.controller().leaveRoom());
      expect(harness.controller().roomPersistenceKind).toBeNull();

      FakeEventSource.instances = [];
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        create: () => json(createdRoomBody({ persistedAtLastFlush: true, persistence: { outcome: "persisted", at: null } }), 201),
      });
      harness.controller().startRoom();
      await vi.waitFor(() => expect(harness.controller().roomId).toBe(ROOM_ID));
      expect(harness.controller().roomPersistenceKind).toBe("persisted");
      harness.unmount();
    });
  });
});
