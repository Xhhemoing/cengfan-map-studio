import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import {
  createdRoomBody,
  FakeEventSource,
  installCollaborationRoomHarness,
  installFetch,
  joinedRoomBody,
  joinRoomWithInvite,
  json,
  mountHook,
  ROOM_ID,
  samplePackage,
} from "./useCollaborationRoom.harness";

installCollaborationRoomHarness();

describe("useCollaborationRoom", () => {
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
