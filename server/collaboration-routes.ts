import { randomBytes } from "node:crypto";
import type http from "node:http";
import { CollaborationError } from "./collaboration";
import type { RoomStore } from "./collaboration-types";
import { corsHeaders, isRecord, readJson, securityHeaders } from "./http-utils";
import type { createRateLimiter } from "./ai/rate-limit";

const DEFAULT_MAX_ROOM_TRANSACTION_BYTES = 8 * 1024 * 1024;
const DEFAULT_ROOM_EVENTS_HEARTBEAT_MS = 20_000;
const MAX_ROOM_EVENTS_TICKETS = 10_000;

interface CollaborationRouterOptions {
  roomStore: RoomStore;
  roomCreateRateLimiter: ReturnType<typeof createRateLimiter>;
  clientIp: (request: http.IncomingMessage) => string;
  maxJsonBodyBytes: number;
  roomEventsTicketTtlMs: number;
  roomEventsHeartbeatMs?: number;
  corsOrigins: readonly string[];
}

interface RouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  pathname: string;
  url: string;
  send: (status: number, body: unknown) => void;
}

function roomAccessToken(request: http.IncomingMessage): string | null {
  const value = request.headers["x-cengfan-room-token"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roomErrorStatus(error: CollaborationError): number {
  if (error.code === "VERSION_CONFLICT" || error.code === "ROOM_CLOSED" || error.code === "ALREADY_JOINED") return 409;
  if (error.code === "ROOM_NOT_FOUND") return 404;
  if (error.code === "SNAPSHOT_TOO_LARGE") return 413;
  if (error.code === "ROOM_LIMIT_REACHED" || error.code === "SUBSCRIBER_LIMIT_REACHED") return 429;
  if (error.code === "ROOM_FORBIDDEN" || error.code === "FORBIDDEN" || error.code === "READONLY_ROOM") return 403;
  if (error.code === "ROOM_INITIALIZING") return 425;
  return 400;
}

export function createCollaborationRouter(options: CollaborationRouterOptions) {
  const roomEventsTickets = new Map<string, { roomId: string; accessToken: string; expiresAt: number }>();
  const maxBodyBytes = Math.min(options.maxJsonBodyBytes, DEFAULT_MAX_ROOM_TRANSACTION_BYTES);
  const roomEventsHeartbeatMs = Math.max(1, options.roomEventsHeartbeatMs ?? DEFAULT_ROOM_EVENTS_HEARTBEAT_MS);
  const sendRoomError = (send: RouteContext["send"], error: CollaborationError) => send(roomErrorStatus(error), {
    error: { code: error.code, message: error.message, currentVersion: error.currentVersion },
  });
  const roomProjection = (room: ReturnType<RoomStore["get"]>, accessToken: string) => {
    if (!room) return null;
    const participant = options.roomStore.authorize(room.id, accessToken, "read");
    return { ...room, role: participant.role, participants: options.roomStore.listParticipants(room.id, accessToken) };
  };
  const storeRoomEventsTicket = (ticket: string, record: { roomId: string; accessToken: string; expiresAt: number }) => {
    if (roomEventsTickets.size >= MAX_ROOM_EVENTS_TICKETS) {
      const now = Date.now();
      for (const [key, candidate] of roomEventsTickets) {
        if (candidate.expiresAt <= now) roomEventsTickets.delete(key);
      }
      if (roomEventsTickets.size >= MAX_ROOM_EVENTS_TICKETS) return false;
    }
    roomEventsTickets.set(ticket, record);
    return true;
  };

  return async ({ request, response, pathname, url, send }: RouteContext): Promise<boolean> => {
    if (request.method === "POST" && pathname === "/api/rooms") {
      const roomLimit = options.roomCreateRateLimiter.check(options.clientIp(request));
      if (!roomLimit.allowed) {
        send(429, { error: { code: "ROOM_RATE_LIMITED", message: "创建房间过于频繁，请稍后重试。" } });
        return true;
      }
      const body = await readJson(request, maxBodyBytes);
      if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId.trim() || typeof body.displayName !== "string" || !body.displayName.trim()) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 和 displayName 必填" } });
        return true;
      }
      try {
        send(201, options.roomStore.create(body.snapshot, { clientId: body.clientId, displayName: body.displayName.trim() }));
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(send, error);
        else throw error;
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
        const room = roomProjection(options.roomStore.get(roomMatch[1]!), accessToken);
        if (!room) {
          send(404, { error: { code: "ROOM_NOT_FOUND", message: "共享房间不存在" } });
        } else if (!room.ready) {
          send(425, { error: { code: "ROOM_INITIALIZING", message: "共享房间正在上传初始工程" } });
        } else {
          send(200, room);
        }
      } catch (error) {
        if (error instanceof CollaborationError) sendRoomError(send, error);
        else throw error;
      }
      return true;
    }

    const invitationMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/invitations$/);
    if (request.method === "POST" && invitationMatch) {
      const body = await readJson(request, maxBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
      } else if (!isRecord(body) || (body.role !== "editor" && body.role !== "viewer")) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "邀请角色无效" } });
      } else {
        try {
          send(201, options.roomStore.createInvitation(invitationMatch[1]!, accessToken, body.role));
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(send, error);
          else throw error;
        }
      }
      return true;
    }

    const joinMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/join$/);
    if (request.method === "POST" && joinMatch) {
      const joinLimit = options.roomCreateRateLimiter.check(`join:${options.clientIp(request)}`);
      if (!joinLimit.allowed) {
        send(429, { error: { code: "ROOM_JOIN_RATE_LIMITED", message: "加入房间尝试过于频繁，请稍后重试。" } });
        return true;
      }
      const body = await readJson(request, maxBodyBytes);
      if (!isRecord(body)
        || typeof body.inviteToken !== "string" || !body.inviteToken.trim()
        || typeof body.clientId !== "string" || !body.clientId.trim()
        || typeof body.displayName !== "string" || !body.displayName.trim()) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "邀请凭证、clientId 和 displayName 必填" } });
      } else {
        try {
          send(200, options.roomStore.join(joinMatch[1]!, {
            inviteToken: body.inviteToken,
            clientId: body.clientId,
            displayName: body.displayName.trim(),
          }));
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(send, error);
          else throw error;
        }
      }
      return true;
    }

    const transactionMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/transactions$/);
    if (request.method === "POST" && transactionMatch) {
      const body = await readJson(request, maxBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
      } else if (!isRecord(body)
        || typeof body.txId !== "string" || !body.txId.trim()
        || typeof body.clientId !== "string" || !body.clientId.trim()
        || !Number.isInteger(body.baseVersion) || Number(body.baseVersion) < 0
        || (body.snapshot === undefined && !Array.isArray(body.operations))
        || (body.snapshot !== undefined && body.operations !== undefined)) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "协作事务格式无效" } });
      } else {
        try {
          const room = options.roomStore.apply(transactionMatch[1]!, accessToken, {
            txId: typeof body.txId === "string" ? body.txId : "",
            clientId: typeof body.clientId === "string" ? body.clientId : "",
            baseVersion: Number(body.baseVersion),
            snapshot: body.snapshot,
            operations: Array.isArray(body.operations) ? body.operations : undefined,
          });
          const prefer = Array.isArray(request.headers.prefer) ? request.headers.prefer.join(",") : request.headers.prefer ?? "";
          send(200, prefer.toLowerCase().includes("return=minimal") ? { ...room, snapshot: undefined } : room);
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(send, error);
          else throw error;
        }
      }
      return true;
    }

    const memberMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/members$/);
    const leaveMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/leave$/);
    if (request.method === "POST" && (memberMatch || leaveMatch)) {
      const body = await readJson(request, maxBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
      } else if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId.trim()) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 必填" } });
      } else {
        try {
          const roomId = (memberMatch ?? leaveMatch)![1]!;
          send(200, memberMatch
            ? options.roomStore.refreshMember(roomId, accessToken, body.clientId)
            : options.roomStore.leave(roomId, accessToken, body.clientId));
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(send, error);
          else throw error;
        }
      }
      return true;
    }

    const accessMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/access$/);
    if (request.method === "POST" && accessMatch) {
      const body = await readJson(request, maxBodyBytes);
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
      } else if (!isRecord(body) || typeof body.clientId !== "string" || !body.clientId.trim() || (body.action !== "set-readonly" && body.action !== "close")) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "clientId 与 action(set-readonly|close) 必填" } });
      } else {
        try {
          send(200, options.roomStore.setAccess(accessMatch[1]!, accessToken, body.clientId, body.action));
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(send, error);
          else throw error;
        }
      }
      return true;
    }

    const operationsMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/operations$/);
    if (request.method === "GET" && operationsMatch) {
      const accessToken = roomAccessToken(request);
      const operationsUrl = new URL(url, "http://localhost");
      const afterVersionParam = operationsUrl.searchParams.get("afterVersion");
      const afterVersion = afterVersionParam === null ? Number.NaN : Number(afterVersionParam);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
      } else if (afterVersionParam === null || !Number.isInteger(afterVersion) || afterVersion < 0) {
        send(400, { error: { code: "VALIDATION_ERROR", message: "afterVersion 必须是非负整数" } });
      } else {
        try {
          const result = options.roomStore.getOperations(operationsMatch[1]!, accessToken, afterVersion);
          send(200, { id: operationsMatch[1]!.toUpperCase(), version: result.version, afterVersion, operations: result.operations });
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(send, error);
          else throw error;
        }
      }
      return true;
    }

    const eventsTicketMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/events-ticket$/);
    if (request.method === "POST" && eventsTicketMatch) {
      const accessToken = roomAccessToken(request);
      if (!accessToken) {
        send(403, { error: { code: "ROOM_FORBIDDEN", message: "需要房间访问凭证" } });
      } else {
        try {
          options.roomStore.authorize(eventsTicketMatch[1]!, accessToken, "read");
          const ticket = randomBytes(24).toString("base64url");
          const expiresAt = Date.now() + options.roomEventsTicketTtlMs;
          if (!storeRoomEventsTicket(ticket, { roomId: eventsTicketMatch[1]!.toUpperCase(), accessToken, expiresAt })) {
            send(429, { error: { code: "ROOM_LIMIT_REACHED", message: "协作事件凭证过多，请稍后重试" } });
          } else {
            send(201, { ticket, expiresAt: new Date(expiresAt).toISOString() });
          }
        } catch (error) {
          if (error instanceof CollaborationError) sendRoomError(send, error);
          else throw error;
        }
      }
      return true;
    }

    const eventsMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/events$/);
    if (request.method !== "GET" || !eventsMatch) return false;
    const eventUrl = new URL(url, "http://localhost");
    const ticket = eventUrl.searchParams.get("ticket");
    const ticketRecord = ticket ? roomEventsTickets.get(ticket) : undefined;
    if (!ticketRecord || ticketRecord.roomId !== eventsMatch[1]!.toUpperCase() || ticketRecord.expiresAt <= Date.now()) {
      if (ticket) roomEventsTickets.delete(ticket);
      send(403, { error: { code: "ROOM_FORBIDDEN", message: "协作事件凭证无效或已过期" } });
      return true;
    }
    roomEventsTickets.delete(ticket!);
    const knownVersionParam = eventUrl.searchParams.get("version");
    const knownVersion = knownVersionParam === null ? Number.NaN : Number(knownVersionParam);
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: () => void = () => undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
      unsubscribeLifecycle();
    };
    try {
      const room = options.roomStore.get(eventsMatch[1]!);
      if (!room) throw new CollaborationError("ROOM_NOT_FOUND", "共享房间不存在");
      const participant = options.roomStore.authorize(eventsMatch[1]!, ticketRecord.accessToken, "read");
      unsubscribe = options.roomStore.subscribe(eventsMatch[1]!, ticketRecord.accessToken, (next) => {
        const payload = next.operations || next.updatedBy === participant.id ? { ...next, snapshot: undefined } : next;
        response.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
      });
      unsubscribeLifecycle = options.roomStore.subscribeLifecycle(eventsMatch[1]!, ticketRecord.accessToken, (event) => {
        if (event.kind === "closed") {
          response.write(`event: closed\ndata: ${JSON.stringify({ id: event.room.id, version: event.room.version, readonly: event.room.readonly === true, closed: true })}\n\n`);
          response.end();
        } else if (event.kind === "access") {
          response.write(`event: snapshot\ndata: ${JSON.stringify({ ...event.room, snapshot: undefined })}\n\n`);
        } else if (!event.members.some((member) => member.clientId === participant.id)) {
          response.write(`event: revoked\ndata: ${JSON.stringify({ id: event.room.id })}\n\n`);
          response.end();
        } else {
          response.write(`event: members\ndata: ${JSON.stringify(event.members)}\n\n`);
        }
      });
      response.writeHead(200, {
        ...securityHeaders(),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...corsHeaders(request, options.corsOrigins),
      });
      response.flushHeaders();
      if (!Number.isInteger(knownVersion) || knownVersion < room.version) {
        response.write(`event: snapshot\ndata: ${JSON.stringify(room)}\n\n`);
      }
    } catch (error) {
      if (error instanceof CollaborationError) sendRoomError(send, error);
      else throw error;
      return true;
    }
    heartbeat = setInterval(() => {
      try {
        options.roomStore.authorize(eventsMatch[1]!, ticketRecord.accessToken, "read");
        response.write(": heartbeat\n\n");
      } catch {
        response.end();
      }
    }, roomEventsHeartbeatMs);
    request.once("aborted", cleanup);
    response.once("close", cleanup);
    return true;
  };
}
