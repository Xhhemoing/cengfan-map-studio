import { describe, expect, it, vi } from "vitest";
import {
  fetchRoomOperations,
  isOwnRoomAcknowledgement,
  submitRoomOperations,
  submitRoomSnapshot,
} from "./collaboration-client";
import { ok } from "./collaboration-client-test-fixtures";

describe("collaboration client", () => {
  it("surfaces version conflicts with the server version", async () => {
    const request = vi.fn(() => ok({ error: { code: "VERSION_CONFLICT", message: "冲突", currentVersion: 3 } }, 409));
    await expect(submitRoomSnapshot("ABC123", "owner-token", { txId: "tx-1", clientId: "c1", baseVersion: 2, snapshot: {} }, request)).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 3 });
  });

  it("requests a metadata-only acknowledgement for uploaded snapshots", async () => {
    const request = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => ok({ id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-2" }));

    await submitRoomSnapshot("ABC123", "owner-token", { txId: "tx-2", clientId: "c1", baseVersion: 1, snapshot: { large: true } }, request);

    expect(request).toHaveBeenCalledWith("/api/rooms/ABC123/transactions", expect.objectContaining({
      headers: { "Content-Type": "application/json", Prefer: "return=minimal", "X-Cengfan-Room-Token": "owner-token" },
    }));
  });

  it("submits incremental operations without serializing a full snapshot", async () => {
    let submittedInit: RequestInit | undefined;
    const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      submittedInit = init;
      return ok({ id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-op" });
    });

    await submitRoomOperations("ABC123", "owner-token", {
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

  it("fetches incremental operations after a version and maps conflict errors", async () => {
    const operations = [{ type: "set", path: ["title"], value: "乙" }];
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 2, afterVersion: 1, operations }))
      .mockImplementationOnce(() => ok({ error: { code: "VERSION_CONFLICT", message: "历史裁剪", currentVersion: 2 } }, 409))
      .mockImplementationOnce(() => ok({ error: { code: "VALIDATION_ERROR", message: "参数错误" } }, 400));

    await expect(fetchRoomOperations("ABC123", "owner-token", 1, request)).resolves.toMatchObject({ version: 2, afterVersion: 1, operations });
    await expect(fetchRoomOperations("ABC123", "owner-token", 0, request)).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 2 });
    await expect(fetchRoomOperations("ABC123", "owner-token", -1, request)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(request).toHaveBeenNthCalledWith(1, "/api/rooms/ABC123/operations?afterVersion=1", expect.objectContaining({
      headers: expect.objectContaining({ "X-Cengfan-Room-Token": "owner-token" }),
    }));
  });
});
