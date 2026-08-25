import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import {
  createdRoomBody,
  FakeEventSource,
  type Harness,
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
   * 三态说的是"上一次**成功**落盘怎么处置了这个房间"。磁盘正在坏掉的那一段时间里它只会重复
   * 上一次成功,于是 `persisted` + 一个旧时刻——响应与一切正常长得一模一样。这是所有降级里
   * 后果最重的一种(服务端此刻挂掉,房间就没了),却是唯一没有任何成员侧说法的一种。R8-2 把
   * 连击放进了 `persistence.lastFailureAt`,这里把它变成一份能渲染的状态,同样是纯展示态。
   */
  describe("roomPersistFailureAt", () => {
    const FAILED_AT = 1_764_000_000_900;

    it("surfaces the streak reported by the join handshake without touching the other verdicts", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({
          persistedAtLastFlush: true,
          persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: FAILED_AT },
        })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

      expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT);
      // 连击不改上一次成功落盘的说法:三态与布尔位照旧,这间房上一次确实被完整写下过。
      expect(harness.controller().roomPersistenceKind).toBe("persisted");
      expect(harness.controller().roomPersistenceDegraded).toBe(false);
      // 纯展示态:不碰离线、终局与连接状态。
      expect(harness.controller().collaborationOffline).toBe(false);
      expect(harness.controller().roomExpired).toBe(false);
      expect(harness.controller().collaborationStatus).toBe("connected");
      harness.unmount();
    });

    it("reports a streak that arrives on the create response", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        create: () => json(createdRoomBody({
          persistedAtLastFlush: false,
          persistence: { outcome: "trimmed", at: null, lastFailureAt: FAILED_AT },
        }), 201),
      });
      const harness = mountHook(samplePackage());
      harness.controller().startRoom();

      await vi.waitFor(() => expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT));
      // 两件事可以同时成立:这间房上一次被裁剪,而且此刻磁盘写不进去。
      expect(harness.controller().roomPersistenceKind).toBe("trimmed");
      expect(harness.controller().roomPersistenceDegraded).toBe(true);
      harness.unmount();
    });

    it("has no streak for a healthy server or one that never reports the field", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000 } })),
      });
      const healthy = mountHook(samplePackage());
      await joinRoomWithInvite(healthy);
      await vi.waitFor(() => expect(healthy.refs.versionRef.current).toBe(1));
      expect(healthy.controller().roomPersistFailureAt).toBeNull();
      healthy.unmount();

      // 只认布尔位的旧服务端根本不会提这件事:不能替它宣布磁盘坏了。
      // 上一次加入把凭证存进了本机,不清掉的话这一次会走恢复凭证的路径,握手响应根本不会被读到。
      window.localStorage.clear();
      FakeEventSource.instances = [];
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: false })),
      });
      const legacy = mountHook(samplePackage());
      await joinRoomWithInvite(legacy);
      await vi.waitFor(() => expect(legacy.controller().roomPersistenceDegraded).toBe(true));
      expect(legacy.controller().roomPersistFailureAt).toBeNull();
      legacy.unmount();
    });

    it("lets a later response end the streak, but keeps it when that response says nothing", async () => {
      let snapshots = 0;
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({
          persistedAtLastFlush: true,
          persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: FAILED_AT },
        })),
        // 快照只带布尔位:这条响应没提落盘处置,不代表磁盘忽然好了。
        room: () => {
          snapshots += 1;
          return json({ id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [], persistedAtLastFlush: true });
        },
      });
      const kept = mountHook(samplePackage());
      await joinRoomWithInvite(kept);
      await vi.waitFor(() => expect(snapshots).toBeGreaterThan(0));
      await vi.waitFor(() => expect(kept.refs.versionRef.current).toBe(1));
      expect(kept.controller().roomPersistFailureAt).toBe(FAILED_AT);
      kept.unmount();

      // 服务端给了处置却没给失败时刻,就是明说连击结束了(下一次成功落盘会清掉这一项)。
      // 同样要先清掉上一次加入存下的凭证,否则这一次不会走握手,连击根本没有被设起来过。
      window.localStorage.clear();
      FakeEventSource.instances = [];
      const request = installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({
          persistedAtLastFlush: true,
          persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: FAILED_AT },
        })),
        room: () => json({
          id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [],
          persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_001_000 },
        }),
      });
      const recovered = mountHook(samplePackage());
      await joinRoomWithInvite(recovered);
      await vi.waitFor(() => expect(recovered.refs.versionRef.current).toBe(1));
      // 握手确实跑过一次(报了连击),随后的快照才有东西可以清掉。
      expect(request.mock.calls.some(([input]) => String(input).endsWith("/join"))).toBe(true);
      expect(recovered.controller().roomPersistFailureAt).toBeNull();
      recovered.unmount();
    });

    it("never lets one room's streak stain the next room or the disconnected panel", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({
          persistedAtLastFlush: true,
          persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: FAILED_AT },
        })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT));

      flushSync(() => harness.controller().leaveRoom());
      expect(harness.controller().roomPersistFailureAt).toBeNull();

      FakeEventSource.instances = [];
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        create: () => json(createdRoomBody({ persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_001_000 } }), 201),
      });
      harness.controller().startRoom();
      await vi.waitFor(() => expect(harness.controller().roomId).toBe(ROOM_ID));
      expect(harness.controller().roomPersistFailureAt).toBeNull();
      harness.unmount();
    });
  });

  /**
   * 落盘说法只从创建、加入与快照那三条响应上进来,而正在编辑的成员稳态下一条也不会再取:
   * 他反复读到的只有事务回执。磁盘中途开始坏掉,面板于是一直停在加入那一刻的说法。R9-2 让
   * 服务端在回执上也报落盘,这里把回执并进同一条记账口,规则与三条握手路径共用一份。
   */
  describe("noteAcknowledgedPersistence", () => {
    const FAILED_AT = 1_764_000_000_900;

    async function joinHealthy(): Promise<Harness> {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({ persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000 } })),
        room: () => json({
          id: ROOM_ID, version: 1, ready: true, snapshot: samplePackage(), role: "editor", members: [],
          persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000 },
        }),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));
      return harness;
    }

    it("surfaces a streak that only the transaction acknowledgement reports", async () => {
      const harness = await joinHealthy();
      expect(harness.controller().roomPersistFailureAt).toBeNull();

      flushSync(() => harness.controller().noteAcknowledgedPersistence({
        persistedAtLastFlush: true,
        persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: FAILED_AT },
      }));

      expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT);
      // 连击不改上一次成功落盘的说法,也不碰离线、终局与连接状态。
      expect(harness.controller().roomPersistenceKind).toBe("persisted");
      expect(harness.controller().roomPersistenceDegraded).toBe(false);
      expect(harness.controller().collaborationOffline).toBe(false);
      expect(harness.controller().roomExpired).toBe(false);
      expect(harness.controller().collaborationStatus).toBe("connected");
      harness.unmount();
    });

    it("keeps the standing verdicts when an old server acknowledges without one", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({
          persistedAtLastFlush: false,
          persistence: { outcome: "trimmed", at: null, lastFailureAt: FAILED_AT },
        })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT));

      // 回执上一个字段都没有:服务端没提这件事,不代表磁盘忽然好了。
      flushSync(() => harness.controller().noteAcknowledgedPersistence({}));

      expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT);
      expect(harness.controller().roomPersistenceKind).toBe("trimmed");
      expect(harness.controller().roomPersistenceDegraded).toBe(true);
      harness.unmount();
    });

    it("lets a boolean-only acknowledgement move the flag without touching the verdict or the streak", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({
          persistedAtLastFlush: false,
          persistence: { outcome: "trimmed", at: null, lastFailureAt: FAILED_AT },
        })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT));

      flushSync(() => harness.controller().noteAcknowledgedPersistence({ persistedAtLastFlush: true }));

      // 只认布尔位的服务端说不出是哪一种处置,更说不出连击有没有结束:两者都沿用上一个说法。
      expect(harness.controller().roomPersistenceDegraded).toBe(false);
      expect(harness.controller().roomPersistenceKind).toBe("trimmed");
      expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT);
      harness.unmount();
    });

    it("lets the acknowledgement end a streak the handshake reported", async () => {
      installFetch({
        snapshotVersion: 1,
        snapshot: samplePackage(),
        operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
        join: () => json(joinedRoomBody({
          persistedAtLastFlush: true,
          persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: FAILED_AT },
        })),
      });
      const harness = mountHook(samplePackage());
      await joinRoomWithInvite(harness);
      await vi.waitFor(() => expect(harness.controller().roomPersistFailureAt).toBe(FAILED_AT));

      // 带了处置却没带失败时刻,是服务端明说"此刻没有连击":菜单上的警告要跟着落下去。
      flushSync(() => harness.controller().noteAcknowledgedPersistence({
        persistedAtLastFlush: true,
        persistence: { outcome: "persisted", at: 1_764_000_001_000 },
      }));

      expect(harness.controller().roomPersistFailureAt).toBeNull();
      expect(harness.controller().roomPersistenceKind).toBe("persisted");
      expect(harness.controller().roomPersistenceDegraded).toBe(false);
      harness.unmount();
    });
  });
});
