// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRoom,
  fetchRoomOperations,
  submitRoomSnapshot,
  subscribeRoom,
  type CollaborationRoom,
  type RoomMember,
  type SubscribeRoomOptions,
} from "./collaboration-client";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import {
  useCollaborationRoom,
  type UseCollaborationRoomOptions,
  type UseCollaborationRoomResult,
} from "./useCollaborationRoom";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./collaboration-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./collaboration-client")>();
  return {
    ...actual,
    createRoom: vi.fn(),
    fetchRoomOperations: vi.fn(),
    submitRoomSnapshot: vi.fn(),
    subscribeRoom: vi.fn(),
  };
});

interface CapturedSubscription {
  onRoom: (room: CollaborationRoom<ProjectPackage>) => void;
  onError?: () => void;
  options?: SubscribeRoomOptions;
  unsubscribe: ReturnType<typeof vi.fn>;
}

let current: UseCollaborationRoomResult | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let subscription: CapturedSubscription | null = null;

function Harness({
  options,
  onRender,
}: {
  options: UseCollaborationRoomOptions;
  onRender: (result: UseCollaborationRoomResult) => void;
}) {
  const result = useCollaborationRoom(options);
  useEffect(() => {
    onRender(result);
  }, [onRender, result]);
  return null;
}

function captureCurrent(result: UseCollaborationRoomResult): void {
  current = result;
}

function getCurrent(): UseCollaborationRoomResult {
  if (!current) throw new Error("Collaboration room hook has not rendered");
  return current;
}

describe("useCollaborationRoom", () => {
  beforeEach(() => {
    current = null;
    subscription = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("keeps room state in sync across SSE events and disconnect backfill", async () => {
    const pack = createProjectPackage({
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      assets: [],
      fonts: [],
      now: new Date("2026-08-24T00:00:00.000Z"),
    });
    const owner: RoomMember = {
      clientId: "client-1",
      role: "owner",
      joinedAt: "2026-08-24T00:00:00.000Z",
      lastSeenAt: "2026-08-24T00:00:00.000Z",
    };
    const room: CollaborationRoom<ProjectPackage> = {
      id: "ABC123",
      version: 0,
      ready: false,
      updatedBy: "client-1",
      members: [owner],
    };
    vi.mocked(createRoom).mockResolvedValue({
      room,
      access: {
        id: "participant-1",
        participantId: "participant-1",
        accessToken: "owner-token",
        displayName: "测试用户",
        role: "owner",
      },
    });
    vi.mocked(submitRoomSnapshot).mockResolvedValue({
      ...room,
      version: 1,
      ready: true,
    });
    vi.mocked(fetchRoomOperations).mockResolvedValue({
      id: room.id,
      version: 2,
      afterVersion: 1,
      operations: [],
    });
    vi.mocked(subscribeRoom).mockImplementation((_roomId, _accessToken, onRoom, onError, options) => {
      const unsubscribe = vi.fn();
      subscription = {
        onRoom: onRoom as (nextRoom: CollaborationRoom<ProjectPackage>) => void,
        onError,
        options,
        unsubscribe,
      };
      return unsubscribe;
    });

    const refs = {
      baselineRef: { current: null },
      versionRef: { current: 0 },
      roomRef: { current: null },
      accessTokenRef: { current: null },
      suppressSendRef: { current: false },
      backfillInFlightRef: { current: false },
    };
    const options: UseCollaborationRoomOptions = {
      clientId: "client-1",
      ...refs,
      currentPackage: vi.fn(() => pack),
      applyPackage: vi.fn((nextPack) => nextPack),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(createElement(Harness, { options, onRender: captureCurrent }));
    });
    await act(async () => {
      getCurrent().startRoom();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(subscription).not.toBeNull();
    expect(getCurrent().collaborationStatus).toBe("connected");
    expect(getCurrent().roomVersion).toBe(1);

    await act(async () => {
      subscription?.onError?.();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(getCurrent().collaborationMessage).toBe("已补齐断线期间的修改");
    expect(getCurrent().roomVersion).toBe(2);
    expect(refs.versionRef.current).toBe(2);
    expect(refs.backfillInFlightRef.current).toBe(false);

    const editor: RoomMember = {
      clientId: "client-2",
      role: "editor",
      joinedAt: "2026-08-24T00:01:00.000Z",
      lastSeenAt: "2026-08-24T00:01:00.000Z",
    };
    act(() => subscription?.options?.onMembers?.([owner, editor]));
    expect(getCurrent().roomMembers).toEqual([owner, editor]);

    act(() => subscription?.options?.onClosed?.({
      id: room.id,
      version: 3,
      readonly: true,
      closed: true,
    }));
    expect(getCurrent()).toMatchObject({
      roomClosed: true,
      roomReadonly: true,
      collaborationStatus: "closed",
      canEdit: false,
    });
  });
});
