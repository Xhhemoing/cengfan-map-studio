import { describe, expect, it, vi } from "vitest";
import {
  acknowledgementMessage,
  armCollaborationSend,
  canSendToRoom,
  conflictMessage,
  createCollaborationHealTracker,
  submitFailureMessage,
  type CollaborationSendRoom,
  type CollaborationSendTransport,
} from "./collaboration-send";
import { CollaborationClientError, type CollaborationRoom } from "./collaboration-client";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";

function pack(fixedFps: number): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: { mode: "normal", fixedFps },
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
}

const connectedRoom: CollaborationSendRoom = {
  roomId: "ROOM01",
  roomAccessToken: "token",
  roomRole: "owner",
  roomReadonly: false,
  roomClosed: false,
  roomExpired: false,
};

function refs(baseline: ProjectPackage | null) {
  return {
    baselineRef: { current: baseline },
    versionRef: { current: 1 },
    roomRef: { current: connectedRoom.roomId },
    accessTokenRef: { current: connectedRoom.roomAccessToken },
    suppressSendRef: { current: false },
    backfillInFlightRef: { current: false },
    mountedRef: { current: true },
  };
}

function controller() {
  return {
    setRoomVersion: vi.fn(),
    setCollaborationStatus: vi.fn(),
    setCollaborationMessage: vi.fn(),
    setCollaborationOffline: vi.fn(),
    reportTerminalRejection: vi.fn(() => false),
    noteAcknowledgedPersistence: vi.fn(),
  };
}

describe("collaboration heal tracker", () => {
  it("does not treat the first sighting of a room as a heal", () => {
    const heal = createCollaborationHealTracker();

    heal.observe({ roomId: "ROOM01", connectionHealCount: 3, roomVersion: 9 });

    expect(heal.consume()).toBe(false);
  });

  it("arms a resend once the connection recovers", () => {
    const heal = createCollaborationHealTracker();
    heal.observe({ roomId: "ROOM01", connectionHealCount: 0, roomVersion: 1 });

    heal.observe({ roomId: "ROOM01", connectionHealCount: 1, roomVersion: 1 });

    expect(heal.consume()).toBe(true);
    // 重投是一次性补投,消费之后不会再自己续上一轮。
    expect(heal.consume()).toBe(false);
  });

  it("arms a resend when the room version advances on the stream", () => {
    const heal = createCollaborationHealTracker();
    heal.observe({ roomId: "ROOM01", connectionHealCount: 0, roomVersion: 1 });

    heal.observe({ roomId: "ROOM01", connectionHealCount: 0, roomVersion: 2 });

    expect(heal.consume()).toBe(true);
  });

  it("ignores a version the send path itself pushed forward", () => {
    const heal = createCollaborationHealTracker();
    heal.observe({ roomId: "ROOM01", connectionHealCount: 0, roomVersion: 1 });

    heal.noteVersion(4);
    heal.observe({ roomId: "ROOM01", connectionHealCount: 0, roomVersion: 4 });

    expect(heal.consume()).toBe(false);
  });

  it("re-baselines instead of healing when the room changes", () => {
    const heal = createCollaborationHealTracker();
    heal.observe({ roomId: "ROOM01", connectionHealCount: 2, roomVersion: 7 });

    heal.observe({ roomId: "ROOM02", connectionHealCount: 0, roomVersion: 0 });

    expect(heal.consume()).toBe(false);
  });
});

describe("send eligibility", () => {
  it("refuses every terminal or read-only room", () => {
    expect(canSendToRoom(connectedRoom)).toBe(true);
    expect(canSendToRoom({ ...connectedRoom, roomId: null })).toBe(false);
    expect(canSendToRoom({ ...connectedRoom, roomAccessToken: null })).toBe(false);
    expect(canSendToRoom({ ...connectedRoom, roomRole: "viewer" })).toBe(false);
    expect(canSendToRoom({ ...connectedRoom, roomReadonly: true })).toBe(false);
    expect(canSendToRoom({ ...connectedRoom, roomClosed: true })).toBe(false);
    expect(canSendToRoom({ ...connectedRoom, roomExpired: true })).toBe(false);
  });
});

describe("send messages", () => {
  it("separates a plain acknowledgement from a server-side merge and a retry", () => {
    expect(acknowledgementMessage(0, undefined)).toBe("增量同步已完成");
    expect(acknowledgementMessage(0, 3)).toContain("自动合并");
    expect(acknowledgementMessage(1, undefined)).toContain("重试");
  });

  it("says whether the backfill succeeded when a conflict exhausts the budget", () => {
    expect(conflictMessage(0)).toContain("补齐最新版本失败");
    expect(conflictMessage(1)).toContain("已同步到最新版本");
  });

  it("keeps a partition apart from a server rejection", () => {
    expect(submitFailureMessage(new Error("boom"), true)).toContain("恢复后会自动续传");
    expect(submitFailureMessage(new Error("boom"), false)).toBe("boom");
  });
});

describe("armCollaborationSend", () => {
  function transport(submit: CollaborationSendTransport["submitOperations"]): CollaborationSendTransport {
    return {
      fetchOperations: vi.fn(async () => ({ id: "ROOM01", version: 1, afterVersion: 1, operations: [] })) as unknown as CollaborationSendTransport["fetchOperations"],
      submitOperations: submit,
    };
  }

  it("uploads the diff between the baseline and the current workspace", async () => {
    vi.useFakeTimers();
    try {
      const uploads: { baseVersion: number; operations: unknown[] }[] = [];
      const submit = vi.fn(async (_roomId: string, _token: string, transaction: { baseVersion: number; operations: unknown[] }) => {
        uploads.push(transaction);
        return { id: "ROOM01", version: 2, ready: true, updatedBy: "someone-else" } as CollaborationRoom<ProjectPackage>;
      }) as unknown as CollaborationSendTransport["submitOperations"];
      const panel = controller();
      const heal = createCollaborationHealTracker();

      const cancel = armCollaborationSend({
        clientId: "client-1",
        room: connectedRoom,
        refs: refs(pack(20)),
        heal,
        controller: panel,
        currentPackage: (exportedAt) => ({ ...pack(45), exportedAt: exportedAt ?? pack(45).exportedAt }),
        applyPackage: () => undefined,
        transport: transport(submit),
        delayMs: 10,
      });
      await vi.advanceTimersByTimeAsync(20);

      expect(uploads).toHaveLength(1);
      expect(uploads[0]!.baseVersion).toBe(1);
      expect(panel.setCollaborationStatus).toHaveBeenLastCalledWith("connected");
      expect(panel.setCollaborationMessage).toHaveBeenLastCalledWith("增量同步已完成");
      cancel?.();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not arm at all for a viewer or an unset baseline", () => {
    const panel = controller();
    const options = {
      clientId: "client-1",
      heal: createCollaborationHealTracker(),
      controller: panel,
      currentPackage: () => pack(45),
      applyPackage: () => undefined,
      delayMs: 10,
    };

    expect(armCollaborationSend({ ...options, room: { ...connectedRoom, roomRole: "viewer" }, refs: refs(pack(20)) })).toBeUndefined();
    expect(armCollaborationSend({ ...options, room: connectedRoom, refs: refs(null) })).toBeUndefined();
  });

  /**
   * 稳态下正在编辑的成员唯一反复读到的服务端说法就是回执。回执被拆成版本与 id 之后,落盘
   * 处境在送出这一路上就断了:磁盘中途开始坏掉,他手上的面板还是加入那一刻的说法。
   */
  it("threads the acknowledged persistence verdict to the panel", async () => {
    vi.useFakeTimers();
    try {
      const submit = vi.fn(async () => ({
        id: "ROOM01",
        version: 2,
        ready: true,
        updatedBy: "someone-else",
        persistedAtLastFlush: true,
        persistence: { outcome: "persisted" as const, at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_900 },
      } as CollaborationRoom<ProjectPackage>)) as unknown as CollaborationSendTransport["submitOperations"];
      const panel = controller();

      const cancel = armCollaborationSend({
        clientId: "client-1",
        room: connectedRoom,
        refs: refs(pack(20)),
        heal: createCollaborationHealTracker(),
        controller: panel,
        currentPackage: (exportedAt) => ({ ...pack(45), exportedAt: exportedAt ?? pack(45).exportedAt }),
        applyPackage: () => undefined,
        transport: transport(submit),
        delayMs: 10,
      });
      await vi.advanceTimersByTimeAsync(20);

      expect(panel.noteAcknowledgedPersistence).toHaveBeenCalledWith({
        persistedAtLastFlush: true,
        persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_900 },
      });
      // 纯展示态:回执照旧收尾,落盘说法不参与状态与文案。
      expect(panel.setCollaborationStatus).toHaveBeenLastCalledWith("connected");
      expect(panel.setCollaborationMessage).toHaveBeenLastCalledWith("增量同步已完成");
      cancel?.();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing about persistence when the acknowledgement carries no verdict", async () => {
    vi.useFakeTimers();
    try {
      const submit = vi.fn(async () => ({
        id: "ROOM01", version: 2, ready: true, updatedBy: "someone-else",
      } as CollaborationRoom<ProjectPackage>)) as unknown as CollaborationSendTransport["submitOperations"];
      const panel = controller();

      const cancel = armCollaborationSend({
        clientId: "client-1",
        room: connectedRoom,
        refs: refs(pack(20)),
        heal: createCollaborationHealTracker(),
        controller: panel,
        currentPackage: (exportedAt) => ({ ...pack(45), exportedAt: exportedAt ?? pack(45).exportedAt }),
        applyPackage: () => undefined,
        transport: transport(submit),
        delayMs: 10,
      });
      await vi.advanceTimersByTimeAsync(20);

      // 旧服务端的回执两个字段都没有:上报一个空说法即可,判定沿用不沿用由面板那一侧的同一套规则决定。
      expect(panel.noteAcknowledgedPersistence).toHaveBeenCalledWith({});
      cancel?.();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a transport failure as offline while keeping the local edits", async () => {
    vi.useFakeTimers();
    try {
      const submit = vi.fn(async () => {
        throw new CollaborationClientError("NETWORK_ERROR", "网络不可达");
      }) as unknown as CollaborationSendTransport["submitOperations"];
      const panel = controller();

      const cancel = armCollaborationSend({
        clientId: "client-1",
        room: connectedRoom,
        refs: refs(pack(20)),
        heal: createCollaborationHealTracker(),
        controller: panel,
        currentPackage: (exportedAt) => ({ ...pack(45), exportedAt: exportedAt ?? pack(45).exportedAt }),
        applyPackage: () => undefined,
        transport: transport(submit),
        delayMs: 10,
      });
      await vi.advanceTimersByTimeAsync(20);

      expect(panel.setCollaborationOffline).toHaveBeenCalledWith(true);
      expect(panel.setCollaborationStatus).toHaveBeenLastCalledWith("error");
      expect(panel.setCollaborationMessage).toHaveBeenLastCalledWith("网络异常，本地修改已保留，恢复后会自动续传");
      cancel?.();
    } finally {
      vi.useRealTimers();
    }
  });
});
