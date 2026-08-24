import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_ACCESS_STORAGE_PREFIX } from "./app-constants";
import type { RoomMember } from "./collaboration-client";
import type { ProjectPackage } from "./project-package";
import { useCollaborationRoom, type UseCollaborationRoomResult } from "./useCollaborationRoom";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  submitRoomSnapshot: vi.fn(),
  subscribeRoom: vi.fn(),
  leaveRoom: vi.fn(),
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
const unsubscribe = vi.fn();
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
    _onError: unknown,
    options: { onMembers?: (members: RoomMember[]) => void } = {},
  ) => {
    emitMembers = options.onMembers ?? null;
    return unsubscribe;
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

  it("still notifies the server when the member leaves on purpose", async () => {
    await mountRoom();

    act(() => latest!.leaveRoom());

    expect(mocks.leaveRoom).toHaveBeenCalledWith("ROOM01", "self-token", "self");
    expect(latest!.roomId).toBeNull();
    expect(latest!.collaborationStatus).toBe("idle");
  });
});
