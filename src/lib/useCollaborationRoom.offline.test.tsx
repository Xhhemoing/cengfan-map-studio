import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { ROOM_ACCESS_STORAGE_PREFIX } from "./app-constants";
import {
  FakeEventSource,
  installCollaborationRoomHarness,
  installFetch,
  joinRoom,
  json,
  mountHook,
  neverSettles,
  requestSignals,
  ROOM_ID,
  ROOM_TOKEN,
  samplePackage,
  setOp,
} from "./useCollaborationRoom.harness";

installCollaborationRoomHarness();

describe("useCollaborationRoom", () => {
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
});
