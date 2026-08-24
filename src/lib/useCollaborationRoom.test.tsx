import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_ACCESS_STORAGE_PREFIX } from "./app-constants";
import { CollaborationClientError, type CollaborationRoom, type RoomKickedInfo, type RoomMember } from "./collaboration-client";
import type { ProjectPackage } from "./project-package";
import { useCollaborationRoom, type UseCollaborationRoomResult } from "./useCollaborationRoom";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  submitRoomSnapshot: vi.fn(),
  subscribeRoom: vi.fn(),
  leaveRoom: vi.fn(),
  fetchRoomOperations: vi.fn(),
  joinRoom: vi.fn(),
  fetchRoom: vi.fn(),
}));

vi.mock("./collaboration-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./collaboration-client")>();
  return { ...actual, ...mocks };
});

const samplePackage = { kind: "cengfan-project-package", exportedAt: "2026-08-24T00:00:00.000Z", title: "本地" } as unknown as ProjectPackage;
const remotePackage = { kind: "cengfan-project-package", exportedAt: "2026-08-24T01:00:00.000Z", title: "远端" } as unknown as ProjectPackage;

function member(clientId: string, role: RoomMember["role"] = "editor"): RoomMember {
  return { clientId, role, joinedAt: "2026-08-24T00:00:00.000Z", lastSeenAt: "2026-08-24T00:00:00.000Z" };
}

let latest: UseCollaborationRoomResult | null = null;
let emitMembers: ((members: RoomMember[]) => void) | null = null;
/** subscribeRoom 的 onKicked:被房主移出的一端只会收到 kicked,不会再收到成员列表。 */
let emitKicked: ((info: RoomKickedInfo) => void) | null = null;
/** subscribeRoom 的 onError:客户端判定断流(onerror 或心跳看门狗超时)时会调用它。 */
let notifyStreamError: (() => void) | null = null;
/** subscribeRoom 的房间事件回调:用来投递远端增量/快照。 */
let emitRoomUpdate: ((room: CollaborationRoom<ProjectPackage>) => void) | null = null;
let subscribeOptions: { version?: number | (() => number) } | null = null;
/** applyPackage 的调用记录:用来断言写回工作区的是哪一份工程、对应哪个版本。 */
let appliedPackages: Array<{ pack: Record<string, unknown>; version: number }> = [];
const lastApplied = (): Record<string, unknown> => appliedPackages.at(-1)!.pack;
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
    applyPackage: (pack, version) => {
      appliedPackages.push({ pack: pack as unknown as Record<string, unknown>, version });
      return pack;
    },
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

async function mountHarness(): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(<Harness onRender={(result) => { latest = result; }} />);
  });
}

async function mountRoom(): Promise<void> {
  await mountHarness();
  await act(async () => {
    latest!.startRoom();
  });
}

beforeEach(() => {
  latest = null;
  emitMembers = null;
  emitKicked = null;
  notifyStreamError = null;
  emitRoomUpdate = null;
  subscribeOptions = null;
  subscriptions = [];
  appliedPackages = [];
  window.localStorage.clear();
  mocks.createRoom.mockResolvedValue({
    room: { id: "ROOM01", version: 0, ready: false, updatedBy: "self", members: [member("self", "owner")] },
    access: { id: "self", participantId: "self", displayName: "本机协作者", role: "owner", accessToken: "self-token" },
  });
  mocks.submitRoomSnapshot.mockResolvedValue({ id: "ROOM01", version: 1, ready: true, updatedBy: "self" });
  mocks.leaveRoom.mockResolvedValue({ id: "ROOM01", version: 1, members: [] });
  mocks.joinRoom.mockResolvedValue({
    room: { id: "ROOM01", version: 7, ready: true, updatedBy: "mate" },
    access: { id: "self", participantId: "self", displayName: "本机协作者", role: "editor", accessToken: "guest-token" },
  });
  mocks.fetchRoom.mockResolvedValue({
    id: "ROOM01",
    version: 7,
    ready: true,
    updatedBy: "mate",
    snapshot: remotePackage,
    role: "editor",
    members: [member("mate", "owner"), member("self")],
  });
  mocks.subscribeRoom.mockImplementation((
    _roomId: string,
    _accessToken: string,
    onRoom: (room: CollaborationRoom<ProjectPackage>) => void,
    onError: () => void,
    options: {
      onMembers?: (members: RoomMember[]) => void;
      onKicked?: (info: RoomKickedInfo) => void;
      version?: number | (() => number);
    } = {},
  ) => {
    emitMembers = options.onMembers ?? null;
    emitKicked = options.onKicked ?? null;
    emitRoomUpdate = onRoom;
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

describe("useCollaborationRoom version state", () => {
  it("exposes the room version reached after creating a room", async () => {
    await mountRoom();

    expect(latest!.roomVersion).toBe(1);
  });

  it("exposes the joined room version instead of staying at v0", async () => {
    await mountHarness();
    act(() => {
      latest!.setRoomInput("room01");
      latest!.setInviteTokenInput("invite-token");
    });

    await act(async () => {
      latest!.joinRoom();
    });

    expect(latest!.roomId).toBe("ROOM01");
    expect(latest!.collaborationStatus).toBe("connected");
    // 加入时只写 versionRef 的话,查看者会一直显示 v0。
    expect(latest!.roomVersion).toBe(7);
  });

  it("advances the room version when a remote delta arrives", async () => {
    await mountRoom();
    expect(latest!.roomVersion).toBe(1);

    act(() => emitRoomUpdate!({
      id: "ROOM01",
      version: 2,
      ready: true,
      updatedBy: "mate",
      operations: [{ type: "set", path: ["title"], value: "远端改名" }],
    }));

    expect(latest!.roomVersion).toBe(2);
    expect(latest!.collaborationStatus).toBe("connected");
    expect(lastApplied().title).toBe("远端改名");
    // 增量接得上本地版本时不该多打一次补齐请求。
    expect(mocks.fetchRoomOperations).not.toHaveBeenCalled();
  });

  it("advances the room version when a remote snapshot arrives", async () => {
    await mountRoom();

    act(() => emitRoomUpdate!({
      id: "ROOM01",
      version: 5,
      ready: true,
      updatedBy: "mate",
      snapshot: remotePackage,
    }));

    expect(latest!.roomVersion).toBe(5);
  });

  it("advances the room version after backfilling a disconnect gap", async () => {
    await mountRoom();
    mocks.fetchRoomOperations.mockResolvedValue({
      id: "ROOM01",
      version: 9,
      operations: [{ type: "set", path: ["title"], value: "断线期间的改动" }],
    });

    await act(async () => {
      notifyStreamError!();
    });

    expect(latest!.roomVersion).toBe(9);
    expect(latest!.collaborationStatus).toBe("connected");
  });
});

describe("useCollaborationRoom version continuity", () => {
  it("backfills the whole interval when a delta skips versions", async () => {
    await mountRoom();
    expect(latest!.roomVersion).toBe(1);
    mocks.fetchRoomOperations.mockResolvedValue({
      id: "ROOM01",
      version: 4,
      operations: [
        { type: "set", path: ["title"], value: "中间事务" },
        { type: "set", path: ["subtitle"], value: "最后事务" },
      ],
    });

    // v1 的本端收到 v4:v2、v3 没送到,事件里只带最后一笔 ops。
    await act(async () => {
      emitRoomUpdate!({
        id: "ROOM01",
        version: 4,
        ready: true,
        updatedBy: "mate",
        operations: [{ type: "set", path: ["subtitle"], value: "最后事务" }],
      });
    });

    expect(mocks.fetchRoomOperations).toHaveBeenCalledWith("ROOM01", "self-token", 1);
    expect(latest!.roomVersion).toBe(4);
    expect(latest!.collaborationStatus).toBe("connected");
    expect(latest!.collaborationMessage).toBe("已补齐跳过的远端修改");
    // 直接套用最后一笔 ops 会丢掉 v2 的改动,补齐后中间事务必须还在。
    expect(lastApplied().title).toBe("中间事务");
    expect(lastApplied().subtitle).toBe("最后事务");
  });

  it("applies the full snapshot when a version jump carries one", async () => {
    await mountRoom();

    // 断线重连时服务端会重放整份房间:snapshot 与最后一笔 ops 同时在场。
    await act(async () => {
      emitRoomUpdate!({
        id: "ROOM01",
        version: 6,
        ready: true,
        updatedBy: "mate",
        snapshot: remotePackage,
        operations: [{ type: "set", path: ["title"], value: "最后事务" }],
      });
    });

    expect(mocks.fetchRoomOperations).not.toHaveBeenCalled();
    expect(latest!.roomVersion).toBe(6);
    expect(lastApplied()).toBe(remotePackage as unknown as Record<string, unknown>);
  });

  it("falls back to the full snapshot when the skipped interval is no longer available", async () => {
    await mountRoom();
    mocks.fetchRoomOperations.mockRejectedValue(
      new CollaborationClientError("VERSION_CONFLICT", "增量历史已被裁剪，请重新获取完整快照", 7),
    );

    await act(async () => {
      emitRoomUpdate!({
        id: "ROOM01",
        version: 7,
        ready: true,
        updatedBy: "mate",
        operations: [{ type: "set", path: ["title"], value: "最后事务" }],
      });
    });

    expect(latest!.roomVersion).toBe(7);
    expect(latest!.collaborationStatus).toBe("connected");
    expect(lastApplied()).toBe(remotePackage as unknown as Record<string, unknown>);
  });

  it("keeps the local version behind when the gap cannot be backfilled", async () => {
    await mountRoom();
    mocks.fetchRoomOperations.mockRejectedValue(new Error("network down"));

    await act(async () => {
      emitRoomUpdate!({
        id: "ROOM01",
        version: 5,
        ready: true,
        updatedBy: "mate",
        operations: [{ type: "set", path: ["title"], value: "最后事务" }],
      });
    });

    // 补齐失败还把本地记成 v5 的话,之后的上传都基于错的基线,服务端也不会再判 VERSION_CONFLICT。
    expect(latest!.roomVersion).toBe(1);
    expect(latest!.collaborationStatus).toBe("error");
    // 跳变的那笔 ops 一次都不该落到工作区。
    expect(appliedPackages).toHaveLength(0);
  });
});
