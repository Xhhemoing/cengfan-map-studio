import type http from "node:http";

import { CollaborationError, type CollaborationRoom, type RoomStore } from "./collaboration";

/** 单笔房间事务的负载上限；与全局 JSON 上限取较小值。 */
const DEFAULT_MAX_ROOM_TRANSACTION_BYTES = 8 * 1024 * 1024;

/**
 * 创建/加入/快照/ack 四个响应共用的落盘字段。字段由 `server/index.ts` 里的房间存储
 * 观测器算出并原样传进来，这里只负责展开进响应体，不重新解释它的语义。
 */
export interface RoomPersistenceFields {
  persistedAtLastFlush: boolean;
  persistence: {
    outcome: "persisted" | "trimmed" | "skipped";
    at: number | null;
    lastFailureAt?: number;
  };
}

/**
 * 房间 HTTP 路由需要的全部外部依赖。这些值在 `createAiServer` 里构造一次，
 * 与单次请求无关的部分全部落在这里，请求相关的部分走 {@link RoomRequestContext}。
 */
export interface RoomRoutesDeps {
  roomStore: RoomStore;
  roomPersistenceFields: (roomId: string) => RoomPersistenceFields;
  roomCreateRateLimiter: { check: (key: string) => { allowed: boolean } };
  clientIp: (request: http.IncomingMessage) => string;
  readJson: (request: http.IncomingMessage, maxBytes: number) => Promise<unknown>;
  maxJsonBodyBytes: number;
  isRecord: (value: unknown) => value is Record<string, unknown>;
}

/** 单次请求的接线面：路由只通过它读请求、发响应。 */
export interface RoomRequestContext {
  request: http.IncomingMessage;
  pathname: string;
  /** 原始 request.url，`operations` 需要它来读查询串。 */
  url: string;
  send: (status: number, body: unknown) => void;
  sendRoomError: (error: CollaborationError) => void;
}

/** 房间访问凭证走独立请求头，避免与工作区 API 的 Authorization 混淆。 */
export const roomAccessToken = (request: http.IncomingMessage): string | null => {
  const value = request.headers["x-cengfan-room-token"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export const roomErrorStatus = (error: CollaborationError): number => error.code === "VERSION_CONFLICT" || error.code === "ROOM_CLOSED" ? 409
  : error.code === "ROOM_NOT_FOUND" ? 404
    : error.code === "ROOM_LIMIT_REACHED" || error.code === "SUBSCRIBER_LIMIT_REACHED" ? 429
      : error.code === "ROOM_FORBIDDEN" || error.code === "FORBIDDEN" || error.code === "READONLY_ROOM" ? 403
        : error.code === "ROOM_INITIALIZING" ? 425
          : 400;

/** SSE 路由留在 index.ts，但错误响应必须与这里的房间路由逐字节一致，所以共用这一个构造器。 */
export const createRoomErrorSender = (send: (status: number, body: unknown) => void) => (error: CollaborationError) => send(roomErrorStatus(error), {
  error: { code: error.code, message: error.message, currentVersion: error.currentVersion },
});

/**
 * 非 SSE 的房间 HTTP 路由。`handle` 命中时自行发完响应并返回 true，
 * 未命中返回 false 交回调用方继续匹配（events-ticket 与 SSE events 仍在 index.ts）。
 *
 * 读体与授权失败沿用原有抛出语义：`readJson` 的体积/JSON 错误与非 CollaborationError
 * 一律向外抛，由 index.ts 的统一 catch 归一成 413/400/500。
 */
export function createRoomRoutes(deps: RoomRoutesDeps) {
  const { roomStore, roomPersistenceFields, roomCreateRateLimiter, clientIp, readJson, isRecord } = deps;
  const maxRoomBodyBytes = Math.min(deps.maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES);

  const roomProjection = (room: CollaborationRoom | undefined, accessToken: string) => {
    if (!room) return null;
    const participant = roomStore.authorize(room.id, accessToken, "read");
    return {
      ...room,
      role: participant.role,
      participants: roomStore.listParticipants(room.id, accessToken),
      ...roomPersistenceFields(room.id),
    };
  };

  const handle = async (context: RoomRequestContext): Promise<boolean> => {
    const { request, pathname, url, send, sendRoomError } = context;

    if (request.method === "POST" && pathname === "/api/rooms") {
      const roomLimit = roomCreateRateLimiter.check(clientIp(request));
      if (!roomLimit.allowed) {
        send(429, { error: { code: "ROOM_RATE_LIMITED", message: "创建房间过于频繁，请稍后重试。" } });
        return true;
      }
      const body = await readJson(request, maxRoomBodyBytes);
      if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId || typeof body.displayName !== "string" || !body.displayName.trim()) {
        send( 400, { error: { code: "VALIDATION_ERROR", message: "clientId 和 displayName 必填" } });
        return true;
      }
      try {
        const created = roomStore.create(body.snapshot, { clientId: body.clientId, displayName: body.displayName.trim() });
        send(201, { ...created, ...roomPersistenceFields(created.room.id) });
      } catch (error) {
        if (error instanceof CollaborationError) {
          sendRoomError(error);
          return true;
        }
        throw error;
      }
      return true;
    }

    const roomMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
    if (request.method === "GET" && roomMatch) {
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
        return true;
      }
      try {
        const room = roomProjection(roomStore.get(roomMatch[1]!), accessToken);
        if (!room) {
          send(404, { error: { code: "ROOM_NOT_FOUND", message: "共享房间不存在" } });
          return true;
        }
        if (!room.ready) {
          send(425, { error: { code: "ROOM_INITIALIZING", message: "共享房间正在上传初始工程" } });
          return true;
        }
        send(200, room);
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    const invitationMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/invitations$/);
    if (request.method === "POST" && invitationMatch) {
      const body = await readJson(request, maxRoomBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
        return true;
      }
      if (!isRecord(body) || (body.role !== "editor" && body.role !== "viewer")) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "邀请角色无效" } });
        return true;
      }
      try {
        send(201, roomStore.createInvitation(invitationMatch[1]!, accessToken, body.role));
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    const joinMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/join$/);
    if (request.method === "POST" && joinMatch) {
      const body = await readJson(request, maxRoomBodyBytes);
      if (!isRecord(body) || typeof body.inviteToken !== "string" || typeof body.clientId !== "string" || typeof body.displayName !== "string") {
        send(400, { error: { code: "VALIDATION_ERROR", message: "邀请凭证、clientId 和 displayName 必填" } });
        return true;
      }
      try {
        const joined = roomStore.join(joinMatch[1]!, { inviteToken: body.inviteToken, clientId: body.clientId, displayName: body.displayName });
        send(200, { ...joined, ...roomPersistenceFields(joined.room.id) });
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    const transactionMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/transactions$/);
    if (request.method === "POST" && transactionMatch) {
      const body = await readJson(request, maxRoomBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
        return true;
      }
      if (!isRecord(body)) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "请求体必须是对象" } });
        return true;
      }
      try {
        const room = roomStore.apply(transactionMatch[1]!, accessToken, {
          txId: typeof body.txId === "string" ? body.txId : "",
          clientId: typeof body.clientId === "string" ? body.clientId : "",
          baseVersion: Number(body.baseVersion),
          snapshot: body.snapshot,
          operations: Array.isArray(body.operations) ? body.operations : undefined,
        });
        const prefer = Array.isArray(request.headers.prefer) ? request.headers.prefer.join(",") : request.headers.prefer ?? "";
        const result = prefer.toLowerCase().includes("return=minimal") ? { ...room, snapshot: undefined } : room;
        // 正在编辑的成员稳态下只会反复收到这条 ack：SSE 对落盘一言不发，创建/加入/快照
        // 那三个报落盘的响应他一次也不会再取。最小 ack 省的是快照，不是事故。
        send(200, { ...result, ...roomPersistenceFields(transactionMatch[1]!) });
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    const memberMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/members$/);
    if (request.method === "POST" && memberMatch) {
      const body = await readJson(request, maxRoomBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
        return true;
      }
      if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 必填" } });
        return true;
      }
      try {
        send(200, roomStore.refreshMember(memberMatch[1]!, accessToken, body.clientId));
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    const leaveMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/leave$/);
    if (request.method === "POST" && leaveMatch) {
      const body = await readJson(request, maxRoomBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
        return true;
      }
      if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 必填" } });
        return true;
      }
      try {
        send(200, roomStore.leave(leaveMatch[1]!, accessToken, body.clientId));
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    const accessMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/access$/);
    if (request.method === "POST" && accessMatch) {
      const body = await readJson(request, maxRoomBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
        return true;
      }
      if (!isRecord(body) || typeof body.clientId !== "string" || (body.action !== "set-readonly" && body.action !== "close")) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 与 action(set-readonly|close) 必填" } });
        return true;
      }
      try {
        send(200, roomStore.setAccess(accessMatch[1]!, accessToken, body.clientId, body.action));
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    const operationsMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/operations$/);
    if (request.method === "GET" && operationsMatch) {
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
        return true;
      }
      const operationsUrl = new URL(url, "http://localhost");
      const afterVersionParam = operationsUrl.searchParams.get("afterVersion");
      const afterVersion = afterVersionParam === null ? Number.NaN : Number(afterVersionParam);
      if (afterVersionParam === null || !Number.isInteger(afterVersion) || afterVersion < 0) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "afterVersion 必须是非负整数" } });
        return true;
      }
      try {
        const result = roomStore.getOperations(operationsMatch[1]!, accessToken, afterVersion);
        send(200, {
          id: operationsMatch[1]!.toUpperCase(),
          version: result.version,
          afterVersion,
          operations: result.operations,
        });
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(error);
        else throw error;
      }
      return true;
    }

    return false;
  };

  return { handle };
}
