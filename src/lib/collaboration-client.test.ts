import { describe, expect, it, vi } from "vitest";
import {
  CollaborationClientError,
  createRoom,
  fetchRoom,
  isOwnRoomAcknowledgement,
  retryInitializingRoom,
  submitRoomOperations,
  submitRoomSnapshot,
} from "./collaboration-client";

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("collaboration client", () => {
  it("creates and reads rooms through the typed API", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, snapshot: { project: 1 } }, 201))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, snapshot: { project: 1 } }));
    await expect(createRoom({ clientId: "c1", snapshot: { project: 1 }, request })).resolves.toMatchObject({ id: "ABC123" });
    await expect(fetchRoom("abc123", request)).resolves.toMatchObject({ id: "ABC123" });
    expect(request).toHaveBeenLastCalledWith("/api/rooms/ABC123");
  });

  it("creates an initializing room without serializing an initial snapshot", async () => {
    const request = vi.fn(() => ok({ id: "FAST01", version: 0, ready: false }, 201));

    await expect(createRoom({ clientId: "c1", request })).resolves.toMatchObject({ id: "FAST01", ready: false });
    expect(request).toHaveBeenCalledWith("/api/rooms", expect.objectContaining({
      body: JSON.stringify({ clientId: "c1" }),
    }));
  });

  it("surfaces version conflicts with the server version", async () => {
    const request = vi.fn(() => ok({ error: { code: "VERSION_CONFLICT", message: "冲突", currentVersion: 3 } }, 409));
    await expect(submitRoomSnapshot("ABC123", { txId: "tx-1", clientId: "c1", baseVersion: 2, snapshot: {} }, request)).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 3 });
  });

  it("requests a metadata-only acknowledgement for uploaded snapshots", async () => {
    const request = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => ok({ id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-2" }));

    await submitRoomSnapshot("ABC123", { txId: "tx-2", clientId: "c1", baseVersion: 1, snapshot: { large: true } }, request);

    expect(request).toHaveBeenCalledWith("/api/rooms/ABC123/transactions", expect.objectContaining({
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    }));
  });

  it("submits incremental operations without serializing a full snapshot", async () => {
    let submittedInit: RequestInit | undefined;
    const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      submittedInit = init;
      return ok({ id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-op" });
    });

    await submitRoomOperations("ABC123", {
      txId: "tx-op",
      clientId: "c1",
      baseVersion: 1,
      operations: [{ type: "set", path: ["project", "map", "scale"], value: 1.2 }],
    }, request);

    expect(JSON.parse(String(submittedInit?.body))).toEqual({
      txId: "tx-op",
      clientId: "c1",
      baseVersion: 1,
      operations: [{ type: "set", path: ["project", "map", "scale"], value: 1.2 }],
    });
    expect(String(submittedInit?.body)).not.toContain("snapshot");
  });

  it("recognizes acknowledgements for the client's pending transaction", () => {
    expect(isOwnRoomAcknowledgement({ updatedBy: "c1", lastTxId: "tx-1" }, "c1", "tx-1")).toBe(true);
    expect(isOwnRoomAcknowledgement({ updatedBy: "c2", lastTxId: "tx-1" }, "c1", "tx-1")).toBe(false);
    expect(isOwnRoomAcknowledgement({ updatedBy: "c1", lastTxId: "tx-2" }, "c1", "tx-1")).toBe(false);
  });

  it("retries an initializing room with bounded backoff", async () => {
    const initializing = new CollaborationClientError("ROOM_INITIALIZING", "上传中");
    const load = vi.fn()
      .mockRejectedValueOnce(initializing)
      .mockRejectedValueOnce(initializing)
      .mockResolvedValue({ id: "FAST01", version: 1, ready: true });
    const wait = vi.fn((_delayMs: number) => Promise.resolve());

    await expect(retryInitializingRoom(load, { delays: [100, 250, 500], wait })).resolves.toMatchObject({ ready: true });
    expect(load).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([100, 250]);
  });

  it("does not retry unrelated room errors", async () => {
    const error = new CollaborationClientError("ROOM_NOT_FOUND", "不存在");
    const load = vi.fn().mockRejectedValue(error);
    const wait = vi.fn((_delayMs: number) => Promise.resolve());

    await expect(retryInitializingRoom(load, { delays: [100, 250], wait })).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
