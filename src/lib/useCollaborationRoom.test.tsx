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
  it("applies a contiguous operations event in place", async () => {
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => json({ error: { code: "VERSION_CONFLICT", message: "不应发生" } }, 409),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

    FakeEventSource.instances[0]!.emit("snapshot", {
      id: ROOM_ID,
      version: 2,
      operations: [setOp(["renderSettings", "fixedFps"], 42)],
    });

    expect(harness.refs.versionRef.current).toBe(2);
    expect(harness.refs.baselineRef.current?.renderSettings.fixedFps).toBe(42);
    expect(harness.controller().roomVersion).toBe(2);
    harness.unmount();
  });

  it("never partial-applies a version gap and backfills the missing interval instead", async () => {
    const request = installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({
        id: ROOM_ID,
        version: 3,
        afterVersion,
        operations: [
          setOp(["renderSettings", "mode"], "low"),
          setOp(["renderSettings", "fixedFps"], 55),
        ],
      }),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));

    // v2 never reached this client: applying the v3 payload directly would drop it.
    FakeEventSource.instances[0]!.emit("snapshot", {
      id: ROOM_ID,
      version: 3,
      operations: [setOp(["renderSettings", "fixedFps"], 55)],
    });

    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(3));
    const operationsCall = request.mock.calls.find(([input]) => String(input).includes("/operations?"));
    expect(String(operationsCall?.[0])).toContain("afterVersion=1");
    expect(harness.refs.baselineRef.current?.renderSettings).toMatchObject({ mode: "low", fixedFps: 55 });
    harness.unmount();
  });

  it("discards a backfill interval whose version is not newer than the local version", async () => {
    const request = installFetch({
      snapshotVersion: 5,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({
        id: ROOM_ID,
        version: 3,
        afterVersion,
        operations: [setOp(["renderSettings", "fixedFps"], 7)],
      }),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(5));
    const appliedBefore = harness.applied.length;

    FakeEventSource.instances[0]!.fail();

    await vi.waitFor(() => expect(request.mock.calls.some(([input]) => String(input).includes("/operations?"))).toBe(true));
    await vi.waitFor(() => expect(harness.refs.backfillInFlightRef.current).toBe(false));
    expect(harness.refs.versionRef.current).toBe(5);
    expect(harness.refs.baselineRef.current?.renderSettings.fixedFps).toBe(20);
    expect(harness.applied).toHaveLength(appliedBefore);
    harness.unmount();
  });

  it("mints a fresh events ticket and keeps exactly one stream through a reconnect storm", async () => {
    vi.useFakeTimers();
    const request = installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    for (let round = 0; round < 5; round += 1) {
      expect(FakeEventSource.live()).toHaveLength(1);
      FakeEventSource.live()[0]!.fail();
      expect(FakeEventSource.live()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(20_000);
      await vi.waitUntil(() => FakeEventSource.instances.length === round + 2, { timeout: 2_000, interval: 1 });
    }

    const ticketCalls = request.mock.calls.filter(([input]) => String(input).endsWith("/events-ticket"));
    expect(ticketCalls).toHaveLength(6);
    expect(FakeEventSource.live()).toHaveLength(1);
    // Every reconnect resumes from the version this client actually holds.
    expect(FakeEventSource.live()[0]!.url).toContain("version=1");
    expect(new Set(FakeEventSource.instances.map((instance) => instance.url)).size).toBe(6);

    harness.unmount();
    expect(FakeEventSource.live()).toHaveLength(0);
  });

  it("stops reconnecting once a closed event arrives", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: (afterVersion) => json({ id: ROOM_ID, version: 1, afterVersion, operations: [] }),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.emit("closed", { id: ROOM_ID, version: 2, readonly: true, closed: true });
    expect(harness.controller().roomClosed).toBe(true);
    expect(harness.controller().collaborationStatus).toBe("closed");

    FakeEventSource.instances[0]!.fail();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    harness.unmount();
  });

  it("terminates the reconnect loop when the backfill discovers the room is closed", async () => {
    vi.useFakeTimers();
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => json({ error: { code: "ROOM_CLOSED", message: "共享房间已关闭" } }, 409),
    });
    const harness = mountHook(samplePackage());
    window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${ROOM_ID}`, ROOM_TOKEN);
    flushSync(() => harness.controller().setRoomInput(ROOM_ID));
    harness.controller().joinRoom();
    await vi.waitUntil(() => FakeEventSource.instances.length > 0, { timeout: 2_000, interval: 1 });

    FakeEventSource.instances[0]!.fail();
    await vi.waitUntil(() => harness.controller().roomClosed, { timeout: 2_000, interval: 1 });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(harness.controller().collaborationStatus).toBe("closed");
    harness.unmount();
  });

  it("aborts an in-flight backfill when the room subscription tears down", async () => {
    installFetch({
      snapshotVersion: 1,
      snapshot: samplePackage(),
      operations: () => neverSettles(),
    });
    const harness = mountHook(samplePackage());
    await joinRoom(harness);
    await vi.waitFor(() => expect(harness.refs.versionRef.current).toBe(1));
    const appliedBefore = harness.applied.length;

    FakeEventSource.instances[0]!.fail();
    await vi.waitFor(() => expect(requestSignals.some((call) => call.url.includes("/operations"))).toBe(true));
    const backfill = requestSignals.find((call) => call.url.includes("/operations"));
    expect(harness.refs.backfillInFlightRef.current).toBe(true);

    harness.unmount();

    expect(backfill?.signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(harness.refs.backfillInFlightRef.current).toBe(false));
    expect(harness.applied).toHaveLength(appliedBefore);
  });
});
