import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_ACCESS_STORAGE_PREFIX } from "./app-constants";
import type { RoomKickedInfo, RoomMember } from "./collaboration-client";
import type { ProjectPackage } from "./project-package";
import { useCollaborationRoom, type UseCollaborationRoomResult } from "./useCollaborationRoom";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  submitRoomSnapshot: vi.fn(),
  subscribeRoom: vi.fn(),
  leaveRoom: vi.fn(),
  fetchRoomOperations: vi.fn(),
}));

vi.mock("./collaboration-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./collaboration-client")>();
  return { ...actual, ...mocks };
});

const samplePackage = { kind: "cengfan-project-package", exportedAt: "2026-08-24T00:00:00.000Z" } as unknown as ProjectPackage;

function member(clientId: string, role: RoomMember["role"] = "editor"): RoomMember {
  return { clientId, role, joinedAt: "2026-08-24T00:00:00.000Z", lastSeenAt: "2026-08-24T00:00:00.000Z" };
}

let latest: UseCollaborationRoomResult | null = null;
let emitMembers: ((members: RoomMember[]) => void) | null = null;
/** subscribeRoom 的 onKicked:被房主移出的一端只会收到 kicked,不会再收到成员列表。 */
let emitKicked: ((info: RoomKickedInfo) => void) | null = null;
/** subscribeRoom 的 onError:客户端判定断流(onerror 或心跳看门狗超时)时会调用它。 */
let notifyStreamError: (() => void) | null = null;
let subscribeOptions: { version?: number | (() => number) } | null = null;
/** 每条订阅一个条目,记录是否已经退订,用来断言同一时刻只有一条流。 */
let subscriptions: Array<{ live: boolean }> = [];
const liveSubscriptions = (): number => subscriptions.filter((entry) => entry.live).length;
const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function Harness({ onRender }: { onRender: (result: UseCollaborationRoomResult) => void }): null {
  const baselineRef = useRef<ProjectPackage | null>(null);
  const versionRef = useRef(0);
  const roomRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const suppressSendRef = useRef(false);
  const backfillInFlightRef = useRef(false);
  const result = useCollaborationRoom({
    clientId: "self",
    currentPackage: () => samplePackage,
    applyPackage: (pack) => pack,
    baselineRef,
    versionRef,
    roomRef,
    accessTokenRef,
    suppressSendRef,
    backfillInFlightRef,
  });
  // 渲染阶段不能改外部变量,改在 effect 里把最新结果交给测试。
  useEffect(() => {
    onRender(result);
  });
  return null;
}

async function mountRoom(): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(<Harness onRender={(result) => { latest = result; }} />);
  });
  await act(async () => {
    latest!.startRoom();
  });
}

beforeEach(() => {
  latest = null;
  emitMembers = null;
  emitKicked = null;
  notifyStreamError = null;
  subscribeOptions = null;
  subscriptions = [];
  window.localStorage.clear();
  mocks.createRoom.mockResolvedValue({
    room: { id: "ROOM01", version: 0, ready: false, updatedBy: "self", members: [member("self", "owner")] },
    access: { id: "self", participantId: "self", displayName: "本机协作者", role: "owner", accessToken: "self-token" },
  });
  mocks.submitRoomSnapshot.mockResolvedValue({ id: "ROOM01", version: 1, ready: true, updatedBy: "self" });
  mocks.leaveRoom.mockResolvedValue({ id: "ROOM01", version: 1, members: [] });
  mocks.subscribeRoom.mockImplementation((
    _roomId: string,
    _accessToken: string,
    _onSnapshot: unknown,
    onError: () => void,
    options: {
      onMembers?: (members: RoomMember[]) => void;
      onKicked?: (info: RoomKickedInfo) => void;
      version?: number | (() => number);
    } = {},
  ) => {
    emitMembers = options.onMembers ?? null;
    emitKicked = options.onKicked ?? null;
    notifyStreamError = onError;
    subscribeOptions = options;
    const entry = { live: true };
    subscriptions.push(entry);
    return () => {
      entry.live = false;
    };
  });
});

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
  vi.clearAllMocks();
});

describe("useCollaborationRoom membership", () => {
  it("keeps the room connected while the member list still contains this client", async () => {
    await mountRoom();
    expect(latest!.roomId).toBe("ROOM01");

    act(() => emitMembers!([member("self", "owner"), member("mate")]));

    expect(latest!.roomMembers.map((entry) => entry.clientId)).toEqual(["self", "mate"]);
    expect(latest!.roomId).toBe("ROOM01");
    expect(latest!.collaborationStatus).toBe("connected");
  });

  it("ends the local room state when a members event no longer lists this client", async () => {
    await mountRoom();
    expect(window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}ROOM01`)).toBe("self-token");

    act(() => emitMembers!([member("mate")]));

    expect(latest!.roomId).toBeNull();
    expect(latest!.roomAccessToken).toBeNull();
    expect(latest!.roomRole).toBeNull();
    expect(latest!.roomMembers).toEqual([]);
    expect(latest!.roomVersion).toBe(0);
    expect(latest!.collaborationStatus).toBe("idle");
    expect(latest!.collaborationMessage).toContain("已被移出房间");
    // 凭证已被服务端撤销,本地也不再保留,避免下次用废凭证重连。
    expect(window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}ROOM01`)).toBeNull();
    // 被移出不需要再通知服务端。
    expect(mocks.leaveRoom).not.toHaveBeenCalled();
  });

  it("ends the local room state when the stream reports this client was kicked", async () => {
    await mountRoom();
    expect(window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}ROOM01`)).toBe("self-token");

    // 被移出的一端拿不到 members 事件,服务端只发 kicked 就断流。
    act(() => emitKicked!({ id: "ROOM01", version: 1, clientId: "self" }));

    expect(latest!.roomId).toBeNull();
    expect(latest!.roomAccessToken).toBeNull();
    expect(latest!.roomRole).toBeNull();
    expect(latest!.roomMembers).toEqual([]);
    expect(latest!.roomVersion).toBe(0);
    expect(latest!.collaborationStatus).toBe("idle");
    expect(latest!.collaborationMessage).toContain("已被移出房间");
    // 与 members 缺席路径同一句文案,两条路径的提示不能分叉。
    expect(latest!.collaborationMessage).toBe("已被移出房间；本地工程保留，不会再同步");
    // 凭证已被服务端撤销,留着只会在下次重连时撞 403。
    expect(window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}ROOM01`)).toBeNull();
    expect(mocks.leaveRoom).not.toHaveBeenCalled();
  });

  it("still notifies the server when the member leaves on purpose", async () => {
    await mountRoom();

    act(() => latest!.leaveRoom());

    expect(mocks.leaveRoom).toHaveBeenCalledWith("ROOM01", "self-token", "self");
    expect(latest!.roomId).toBeNull();
    expect(latest!.collaborationStatus).toBe("idle");
  });
});

describe("useCollaborationRoom subscription", () => {
  it("keeps exactly one live stream across leave and re-join", async () => {
    await mountRoom();
    expect(mocks.subscribeRoom).toHaveBeenCalledTimes(1);
    expect(liveSubscriptions()).toBe(1);

    act(() => latest!.leaveRoom());
    expect(liveSubscriptions()).toBe(0);

    await act(async () => {
      latest!.startRoom();
    });

    expect(mocks.subscribeRoom).toHaveBeenCalledTimes(2);
    // 重新订阅不叠流:上一条已经退订,房间上始终只有一条 EventSource。
    expect(liveSubscriptions()).toBe(1);
  });

  it("drops the stream when the client is removed from the member list", async () => {
    await mountRoom();

    act(() => emitMembers!([member("mate")]));

    expect(liveSubscriptions()).toBe(0);
  });

  it("drops the stream when the client is kicked", async () => {
    await mountRoom();

    act(() => emitKicked!({ id: "ROOM01", version: 1, clientId: "self" }));

    expect(liveSubscriptions()).toBe(0);
  });

  it("lets the stream resume from the version reached after backfill", async () => {
    await mountRoom();

    // 传的是取值函数而非订阅时的版本快照,重连才能带上补齐后的最新版本。
    expect(typeof subscribeOptions!.version).toBe("function");
    expect((subscribeOptions!.version as () => number)()).toBe(1);
  });

  it("describes the disconnect honestly instead of promising a browser reconnect", async () => {
    await mountRoom();
    mocks.fetchRoomOperations.mockRejectedValue(new Error("network down"));

    await act(async () => {
      notifyStreamError!();
    });

    expect(latest!.collaborationStatus).toBe("error");
    // 重连由 subscribeRoom 自己接管(换 ticket + 退避 + 长间隔),浏览器自带重连只会撞 403。
    expect(latest!.collaborationMessage).not.toContain("浏览器");
    expect(latest!.collaborationMessage).toContain("正在自动重连");
    expect(latest!.collaborationMessage).toContain("重新加入");
  });
});
