// 仅供 useCollaborationRoom 测试使用的共享装置:从 src/lib/useCollaborationRoom.test.tsx
// 原样搬出的 FakeEventSource、fetch 脚本装置与挂载/加入助手,供按域拆分后的
// src/lib/useCollaborationRoom.*.test.tsx 共用。
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, vi, type MockInstance } from "vitest";
import { ROOM_ACCESS_STORAGE_PREFIX } from "./app-constants";
import type { CollaborationOperation } from "./collaboration-operations";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import { useCollaborationRoom, type UseCollaborationRoomResult } from "./useCollaborationRoom";

export const ROOM_ID = "ROOM01";
export const ROOM_TOKEN = "member-token";

export class FakeEventSource {
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

export function samplePackage(fixedFps = 20, mode: "normal" | "low" = "normal"): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: { mode, fixedFps },
  });
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

export interface Harness {
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

/**
 * R7-7 的兜底网:钩子挂着 SSE 订阅、在途 fetch 与退避定时器,断言一旦在 `unmount()` 那一行
 * 之前抛出,这个根就会在这一轮剩下的用例里继续跑,直到撞上 jsdom 拆掉的 `window`。所以每个根
 * 都登记下来,在 `afterEach` 里兜底卸载;用例里原有的 `unmount()` 保留,卸载是幂等的。
 */
const mountedRoots: { root: Root; container: HTMLDivElement }[] = [];

function unmountRoot(entry: { root: Root; container: HTMLDivElement }): void {
  const index = mountedRoots.indexOf(entry);
  if (index < 0) return;
  mountedRoots.splice(index, 1);
  flushSync(() => entry.root.unmount());
  entry.container.remove();
}

export function mountHook(initial: ProjectPackage): Harness {
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
  const entry = { root, container };
  mountedRoots.push(entry);
  flushSync(() => root.render(<Harnessed />));
  return {
    controller: () => controller!,
    refs,
    applied,
    unmount: () => unmountRoot(entry),
  };
}

export interface ServerScript {
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

export const createdRoomBody = (extra: Record<string, unknown> = {}) => ({
  room: { id: ROOM_ID, version: 0, ready: true },
  access: { id: "p-owner", participantId: "p-owner", displayName: "创建者", role: "owner", accessToken: ROOM_TOKEN },
  ...extra,
});

export const joinedRoomBody = (extra: Record<string, unknown> = {}) => ({
  room: { id: ROOM_ID, version: 0, ready: true },
  access: { id: "p-member", participantId: "p-member", displayName: "成员", role: "editor", accessToken: ROOM_TOKEN },
  ...extra,
});

export function installFetch(script: ServerScript): MockInstance {
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

/**
 * 每次请求拿到的取消信号,用来断言离开房间/卸载时在途请求确实被中止。拆分后由多个用例文件
 * 共读,所以就地清空而不是重新赋值,导入方拿到的始终是同一个数组。
 */
export const requestSignals: { url: string; signal?: AbortSignal }[] = [];

/** 网络分区:请求发出去了,响应永远不来。 */
export const neverSettles = (): Promise<Response> => new Promise<Response>(() => {});

export async function joinRoom(harness: Harness): Promise<void> {
  window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
  flushSync(() => harness.controller().setRoomInput(ROOM_ID));
  harness.controller().joinRoom();
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
}

/** 邀请凭证路径:本机没有存过凭证,所以握手真的会走一次 `POST /api/rooms/:id/join`。 */
export async function joinRoomWithInvite(harness: Harness): Promise<void> {
  flushSync(() => {
    harness.controller().setRoomInput(ROOM_ID);
    harness.controller().setInviteTokenInput("invite-token");
  });
  harness.controller().joinRoom();
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
}

export const setOp = (path: string[], value: unknown): CollaborationOperation => ({ type: "set", path, value });

/**
 * 注册每个用例文件都依赖的两个文件级钩子。`afterEach` 的兜底卸载装在文件层,断言中途抛出时
 * 这一轮挂过的根仍然会被拆掉(setupFiles 的 leaked-root 守卫只报告缺网,不代替这张网)。
 */
export function installCollaborationRoomHarness(): void {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    FakeEventSource.instances = [];
    requestSignals.length = 0;
    window.localStorage.clear();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    // 先卸载再拆桩:卸载会中止在途请求、关掉订阅,那一步仍然需要用例装好的 fetch/EventSource。
    for (const entry of [...mountedRoots]) unmountRoot(entry);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    globalThis.EventSource = originalEventSource;
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
  });
}
