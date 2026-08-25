import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { ROOM_ACCESS_STORAGE_PREFIX } from "./app-constants";
import {
  FakeEventSource,
  type Harness,
  installCollaborationRoomHarness,
  installFetch,
  joinRoom,
  json,
  mountHook,
  neverSettles,
  ROOM_ID,
  ROOM_TOKEN,
  samplePackage,
} from "./useCollaborationRoom.harness";

installCollaborationRoomHarness();

describe("useCollaborationRoom", () => {
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
});
