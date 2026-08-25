// @vitest-environment node
import { describe, expect, it } from "vitest";
import type http from "node:http";
import { CollaborationError, createRoomStore, type RoomStore } from "./collaboration";
import {
  createRoomErrorSender,
  createRoomRoutes,
  roomAccessToken,
  roomErrorStatus,
  type RoomPersistenceFields,
  type RoomRoutesDeps,
} from "./room-routes";

/**
 * 这些用例盯的是接缝本身，而不是房间语义：房间语义的端到端 pin 仍然在
 * server/index.test.ts 里走同一套 HTTP。这里只回答「index.ts 把什么交给了
 * room-routes.ts，room-routes.ts 又把什么交还回去」——deps struct 少一项、
 * 未命中时忘了交回控制权、错误映射两边分叉，都会在这里先响。
 */

type SentResponse = { status: number; body: unknown };

const persistenceFields = (): RoomPersistenceFields => ({
  persistedAtLastFlush: true,
  persistence: { outcome: "persisted", at: null },
});

function fakeRequest(
  method: string,
  headers: Record<string, string | string[]> = {},
  body?: unknown,
): http.IncomingMessage {
  return { method, headers, body } as unknown as http.IncomingMessage;
}

interface Harness {
  sent: SentResponse[];
  roomErrors: CollaborationError[];
  readJsonCaps: number[];
  rateLimitKeys: string[];
  handle: (
    method: string,
    pathname: string,
    options?: { url?: string; headers?: Record<string, string | string[]>; body?: unknown },
  ) => Promise<boolean>;
}

function createHarness(overrides: Partial<RoomRoutesDeps> & { allowRateLimit?: boolean } = {}): Harness {
  const sent: SentResponse[] = [];
  const roomErrors: CollaborationError[] = [];
  const readJsonCaps: number[] = [];
  const rateLimitKeys: string[] = [];
  const allowRateLimit = overrides.allowRateLimit ?? true;

  const routes = createRoomRoutes({
    roomStore: createRoomStore(),
    roomPersistenceFields: persistenceFields,
    roomCreateRateLimiter: {
      check: (key) => {
        rateLimitKeys.push(key);
        return { allowed: allowRateLimit };
      },
    },
    clientIp: () => "203.0.113.9",
    readJson: (request, maxBytes) => {
      readJsonCaps.push(maxBytes);
      return Promise.resolve((request as unknown as { body?: unknown }).body ?? {});
    },
    maxJsonBodyBytes: 8 * 1024 * 1024,
    isRecord: (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
    ...overrides,
  });

  const send = (status: number, body: unknown) => { sent.push({ status, body }); };
  return {
    sent,
    roomErrors,
    readJsonCaps,
    rateLimitKeys,
    handle: (method, pathname, options = {}) => routes.handle({
      request: fakeRequest(method, options.headers, options.body),
      pathname,
      url: options.url ?? pathname,
      send,
      sendRoomError: (error) => {
        roomErrors.push(error);
        createRoomErrorSender(send)(error);
      },
    }),
  };
}

describe("roomErrorStatus", () => {
  it("maps every collaboration error code to its frozen HTTP status", () => {
    const mapped = (code: ConstructorParameters<typeof CollaborationError>[0]) =>
      roomErrorStatus(new CollaborationError(code, "x"));

    expect(mapped("VERSION_CONFLICT")).toBe(409);
    expect(mapped("ROOM_CLOSED")).toBe(409);
    expect(mapped("ROOM_NOT_FOUND")).toBe(404);
    expect(mapped("ROOM_LIMIT_REACHED")).toBe(429);
    expect(mapped("SUBSCRIBER_LIMIT_REACHED")).toBe(429);
    expect(mapped("ROOM_FORBIDDEN")).toBe(403);
    expect(mapped("FORBIDDEN")).toBe(403);
    expect(mapped("READONLY_ROOM")).toBe(403);
    expect(mapped("ROOM_INITIALIZING")).toBe(425);
    expect(mapped("INVALID_TRANSACTION")).toBe(400);
    expect(mapped("INVITATION_INVALID")).toBe(400);
    expect(mapped("INVITATION_EXPIRED")).toBe(400);
  });
});

describe("createRoomErrorSender", () => {
  it("emits code, message and currentVersion at the mapped status", () => {
    // SSE 路由留在 index.ts，但它用的是同一个构造器；这里的形状变了两边就一起变。
    const sent: SentResponse[] = [];
    const conflict = new CollaborationError("VERSION_CONFLICT", "版本冲突", 7);

    createRoomErrorSender((status, body) => { sent.push({ status, body }); })(conflict);

    expect(sent).toEqual([{
      status: 409,
      body: { error: { code: "VERSION_CONFLICT", message: "版本冲突", currentVersion: 7 } },
    }]);
  });

  it("keeps currentVersion present as undefined when the error carries none", () => {
    const sent: SentResponse[] = [];
    createRoomErrorSender((status, body) => { sent.push({ status, body }); })(
      new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在"),
    );

    const body = sent[0]!.body as { error: Record<string, unknown> };
    expect(body.error.currentVersion).toBeUndefined();
    expect("currentVersion" in body.error).toBe(true);
  });
});

describe("roomAccessToken", () => {
  it("reads and trims the room token header", () => {
    expect(roomAccessToken(fakeRequest("GET", { "x-cengfan-room-token": "  tok-1  " }))).toBe("tok-1");
  });

  it("treats a missing, blank or repeated header as no credential", () => {
    expect(roomAccessToken(fakeRequest("GET"))).toBeNull();
    expect(roomAccessToken(fakeRequest("GET", { "x-cengfan-room-token": "   " }))).toBeNull();
    expect(roomAccessToken(fakeRequest("GET", { "x-cengfan-room-token": ["a", "b"] }))).toBeNull();
  });
});

describe("createRoomRoutes routing seam", () => {
  it("hands events-ticket and the SSE stream back to index.ts", async () => {
    // 这两条仍住在 index.ts（ticket 表、openRoomStreams、背压计量都在那边）。
    // handle 一旦把它们吞掉，SSE 就会静默变成 404。
    const harness = createHarness();

    expect(await harness.handle("POST", "/api/rooms/ABC123/events-ticket")).toBe(false);
    expect(await harness.handle("GET", "/api/rooms/ABC123/events", { url: "/api/rooms/ABC123/events?ticket=t" })).toBe(false);
    expect(harness.sent).toEqual([]);
  });

  it("hands non-room and wrong-method requests back to index.ts", async () => {
    const harness = createHarness();

    expect(await harness.handle("GET", "/api/health")).toBe(false);
    expect(await harness.handle("POST", "/api/ai/agent")).toBe(false);
    expect(await harness.handle("DELETE", "/api/rooms/ABC123")).toBe(false);
    expect(await harness.handle("GET", "/api/rooms")).toBe(false);
    expect(await harness.handle("POST", "/api/rooms/ABC123/unknown")).toBe(false);
    expect(harness.sent).toEqual([]);
  });

  it("claims every non-SSE room route it owns", async () => {
    const harness = createHarness();
    const owned: Array<[string, string]> = [
      ["POST", "/api/rooms"],
      ["GET", "/api/rooms/ABC123"],
      ["POST", "/api/rooms/ABC123/invitations"],
      ["POST", "/api/rooms/ABC123/join"],
      ["POST", "/api/rooms/ABC123/transactions"],
      ["POST", "/api/rooms/ABC123/members"],
      ["POST", "/api/rooms/ABC123/leave"],
      ["POST", "/api/rooms/ABC123/access"],
      ["GET", "/api/rooms/ABC123/operations"],
    ];

    for (const [method, pathname] of owned) {
      expect(await harness.handle(method, pathname), `${method} ${pathname}`).toBe(true);
    }
    expect(harness.sent).toHaveLength(owned.length);
  });
});

describe("createRoomRoutes dependency wiring", () => {
  it("caps every room body at min(maxJsonBodyBytes, 8 MiB)", async () => {
    const generous = createHarness({ maxJsonBodyBytes: 64 * 1024 * 1024 });
    await generous.handle("POST", "/api/rooms", { body: { clientId: "c", displayName: "n" } });
    expect(generous.readJsonCaps).toEqual([8 * 1024 * 1024]);

    const tight = createHarness({ maxJsonBodyBytes: 1024 });
    await tight.handle("POST", "/api/rooms/ABC123/join", { body: {} });
    expect(tight.readJsonCaps).toEqual([1024]);
  });

  it("rate limits room creation on the injected client ip", async () => {
    const harness = createHarness({ allowRateLimit: false });

    expect(await harness.handle("POST", "/api/rooms", { body: { clientId: "c", displayName: "n" } })).toBe(true);
    expect(harness.rateLimitKeys).toEqual(["203.0.113.9"]);
    expect(harness.sent).toEqual([{
      status: 429,
      body: { error: { code: "ROOM_RATE_LIMITED", message: "创建房间过于频繁，请稍后重试。" } },
    }]);
    // 限流命中时不该再读请求体。
    expect(harness.readJsonCaps).toEqual([]);
  });

  it("spreads the injected persistence fields into the create response", async () => {
    const harness = createHarness({
      roomPersistenceFields: () => ({
        persistedAtLastFlush: false,
        persistence: { outcome: "skipped", at: 1_700_000_000_000, lastFailureAt: 1_700_000_001_000 },
      }),
    });

    await harness.handle("POST", "/api/rooms", { body: { clientId: "c", displayName: " 阿真 " } });

    const created = harness.sent[0]!;
    expect(created.status).toBe(201);
    const body = created.body as { room: { id: string }; persistedAtLastFlush: boolean; persistence: unknown };
    expect(body.persistedAtLastFlush).toBe(false);
    expect(body.persistence).toEqual({ outcome: "skipped", at: 1_700_000_000_000, lastFailureAt: 1_700_000_001_000 });
    expect(body.room.id).toMatch(/^[A-Z0-9]+$/);
  });

  it("validates create payloads before touching the room store", async () => {
    const harness = createHarness();

    expect(await harness.handle("POST", "/api/rooms", { body: { clientId: "c", displayName: "   " } })).toBe(true);
    expect(harness.sent).toEqual([{
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "clientId 和 displayName 必填" } },
    }]);
  });

  it("answers room reads without a credential as ROOM_FORBIDDEN", async () => {
    const harness = createHarness();

    expect(await harness.handle("GET", "/api/rooms/ABC123")).toBe(true);
    expect(harness.sent).toEqual([{
      status: 403,
      body: { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } },
    }]);
  });

  it("rejects a missing or malformed afterVersion on operations", async () => {
    const harness = createHarness();
    const headers = { "x-cengfan-room-token": "tok" };
    const expected = {
      status: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "afterVersion 必须是非负整数" } },
    };

    await harness.handle("GET", "/api/rooms/ABC123/operations", { headers });
    await harness.handle("GET", "/api/rooms/ABC123/operations", { headers, url: "/api/rooms/ABC123/operations?afterVersion=-1" });
    await harness.handle("GET", "/api/rooms/ABC123/operations", { headers, url: "/api/rooms/ABC123/operations?afterVersion=1.5" });

    expect(harness.sent).toEqual([expected, expected, expected]);
  });
});

describe("createRoomRoutes error propagation", () => {
  it("routes CollaborationError through the injected sender", async () => {
    const store = createRoomStore();
    const harness = createHarness({
      roomStore: {
        ...store,
        create: () => { throw new CollaborationError("ROOM_LIMIT_REACHED", "房间数量已达上限"); },
      } as unknown as RoomStore,
    });

    expect(await harness.handle("POST", "/api/rooms", { body: { clientId: "c", displayName: "n" } })).toBe(true);
    expect(harness.roomErrors.map((error) => error.code)).toEqual(["ROOM_LIMIT_REACHED"]);
    expect(harness.sent).toEqual([{
      status: 429,
      body: { error: { code: "ROOM_LIMIT_REACHED", message: "房间数量已达上限", currentVersion: undefined } },
    }]);
  });

  it("rethrows non-collaboration failures so index.ts can answer 500", async () => {
    // 这条是搬迁前的行为：房间存储抛的不是 CollaborationError 时一路抛到
    // createAiServer 的统一 catch，由它归一成 INTERNAL_ERROR。
    const store = createRoomStore();
    const harness = createHarness({
      roomStore: {
        ...store,
        create: () => { throw new Error("disk on fire"); },
      } as unknown as RoomStore,
    });

    await expect(harness.handle("POST", "/api/rooms", { body: { clientId: "c", displayName: "n" } }))
      .rejects.toThrow("disk on fire");
    expect(harness.sent).toEqual([]);
  });

  it("lets read-body failures escape to the shared 413/400 handler", async () => {
    const harness = createHarness({
      readJson: () => Promise.reject(new Error("请求体过大")),
    });

    await expect(harness.handle("POST", "/api/rooms/ABC123/transactions", { headers: { "x-cengfan-room-token": "tok" } }))
      .rejects.toThrow("请求体过大");
    expect(harness.sent).toEqual([]);
  });
});
