// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRoomStore } from "./collaboration";

describe("collaboration room store membership and invitations", () => {
  it("creates a room with the owner as its first member", () => {
    const secrets = ["owner-access"];
    const store = createRoomStore({ generateId: () => "MEM001", generateSecret: () => secrets.shift()! });
    const created = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });

    expect(created.room.members).toEqual([
      expect.objectContaining({ clientId: "owner", role: "owner" }),
    ]);
    expect(created.room.members![0]!.joinedAt).toBeDefined();
    expect(created.room.members![0]!.lastSeenAt).toBeDefined();
  });

  it("tracks members across joins and refreshes lastSeenAt on heartbeat", () => {
    let tick = 1_000;
    const secrets = ["owner-access", "editor-invite", "editor-access", "viewer-invite", "viewer-access"];
    const store = createRoomStore({
      generateId: () => "MEM002",
      generateSecret: () => secrets.shift()!,
      now: () => tick,
    });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const editorInvite = store.createInvitation("MEM002", owner.access.accessToken, "editor");
    const editor = store.join("MEM002", { inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑同学" });
    const viewerInvite = store.createInvitation("MEM002", owner.access.accessToken, "viewer");
    store.join("MEM002", { inviteToken: viewerInvite.token, clientId: "viewer", displayName: "查看同学" });

    expect(store.get("MEM002")!.members.map((member) => ({ clientId: member.clientId, role: member.role }))).toEqual([
      { clientId: "owner", role: "owner" },
      { clientId: "editor", role: "editor" },
      { clientId: "viewer", role: "viewer" },
    ]);

    tick += 5_000;
    const heartbeat = store.refreshMember("MEM002", editor.access.accessToken, "editor");
    expect(heartbeat.members).toHaveLength(3);
    const editorMember = heartbeat.members.find((member) => member.clientId === "editor")!;
    expect(editorMember.lastSeenAt).toBe(new Date(1_000 + 5_000).toISOString());
    expect(editorMember.joinedAt).toBe(new Date(1_000).toISOString());
    expect(heartbeat.version).toBe(0);
  });

  it("removes a member on leave and stays idempotent for unknown members", () => {
    const secrets = ["owner-access", "editor-invite", "editor-access"];
    const store = createRoomStore({ generateId: () => "MEM003", generateSecret: () => secrets.shift()! });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const editorInvite = store.createInvitation("MEM003", owner.access.accessToken, "editor");
    const editor = store.join("MEM003", { inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑同学" });

    const left = store.leave("MEM003", editor.access.accessToken, "editor");
    expect(left.members.map((member) => member.clientId)).toEqual(["owner"]);
    expect(store.leave("MEM003", editor.access.accessToken, "editor").members.map((member) => member.clientId)).toEqual(["owner"]);
    expect(store.leave("MEM003", owner.access.accessToken, "nobody").members.map((member) => member.clientId)).toEqual(["owner"]);
  });

  it("does not let a viewer remove the owner from the member roster", () => {
    const secrets = ["owner-access", "viewer-invite", "viewer-access"];
    const store = createRoomStore({ generateId: () => "AUTH01", generateSecret: () => secrets.shift()! });
    const owner = store.create({}, { clientId: "owner", displayName: "Owner" });
    const invitation = store.createInvitation("AUTH01", owner.access.accessToken, "viewer");
    const viewer = store.join("AUTH01", {
      inviteToken: invitation.token,
      clientId: "viewer",
      displayName: "Viewer",
    });

    expect(() => store.leave("AUTH01", viewer.access.accessToken, "owner"))
      .toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
    expect(store.get("AUTH01")?.members.map((member) => member.clientId)).toEqual(["owner", "viewer"]);
  });

  it("does not let a viewer refresh an arbitrary client id", () => {
    const secrets = ["owner-access", "viewer-invite", "viewer-access"];
    const store = createRoomStore({ generateId: () => "AUTH02", generateSecret: () => secrets.shift()! });
    const owner = store.create({}, { clientId: "owner", displayName: "Owner" });
    const invitation = store.createInvitation("AUTH02", owner.access.accessToken, "viewer");
    const viewer = store.join("AUTH02", {
      inviteToken: invitation.token,
      clientId: "viewer",
      displayName: "Viewer",
    });

    expect(() => store.refreshMember("AUTH02", viewer.access.accessToken, "forged-client"))
      .toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
    expect(store.get("AUTH02")?.members.map((member) => member.clientId)).toEqual(["owner", "viewer"]);
  });

  it("permits an invited editor to update a room and rejects a viewer write", () => {
    const secrets = ["owner-access", "editor-invite", "viewer-invite", "editor-access", "viewer-access"];
    const store = createRoomStore({
      generateId: () => "ROLE01",
      generateSecret: () => secrets.shift()!,
    });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const editorInvite = store.createInvitation("ROLE01", owner.access.accessToken, "editor");
    const viewerInvite = store.createInvitation("ROLE01", owner.access.accessToken, "viewer");
    const editor = store.join("ROLE01", {
      inviteToken: editorInvite.token,
      clientId: "editor",
      displayName: "编辑同学",
    });
    const viewer = store.join("ROLE01", {
      inviteToken: viewerInvite.token,
      clientId: "viewer",
      displayName: "查看同学",
    });

    expect(store.apply("ROLE01", editor.access.accessToken, {
      txId: "editor-1",
      clientId: "editor",
      baseVersion: 0,
      snapshot: { title: "编辑完成" },
    }).snapshot).toEqual({ title: "编辑完成" });

    expect(() => store.apply("ROLE01", viewer.access.accessToken, {
      txId: "viewer-1",
      clientId: "viewer",
      baseVersion: 1,
      snapshot: { title: "越权" },
    })).toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
  });

  it("rejects unknown access tokens and non-owner invitations", () => {
    const secrets = ["owner-access", "editor-invite", "editor-access"];
    const store = createRoomStore({ generateId: () => "ACCESS1", generateSecret: () => secrets.shift()! });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const invitation = store.createInvitation("ACCESS1", owner.access.accessToken, "editor");
    const editor = store.join("ACCESS1", { inviteToken: invitation.token, clientId: "editor", displayName: "编辑同学" });

    expect(() => store.authorize("ACCESS1", "not-a-token", "read")).toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
    expect(() => store.createInvitation("ACCESS1", editor.access.accessToken, "viewer")).toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
  });

  it("consumes invitations once and rejects expired invitations", () => {
    let now = 1_000;
    const secrets = ["owner-access", "invite-once", "member-access", "invite-expired"];
    const store = createRoomStore({
      generateId: () => "INVITE1",
      generateSecret: () => secrets.shift()!,
      invitationTtlMs: 10,
      now: () => now,
    });
    const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
    const oneTime = store.createInvitation("INVITE1", owner.access.accessToken, "viewer");
    store.join("INVITE1", { inviteToken: oneTime.token, clientId: "viewer", displayName: "查看同学" });

    expect(() => store.join("INVITE1", { inviteToken: oneTime.token, clientId: "again", displayName: "重复" })).toThrowError(expect.objectContaining({ code: "INVITATION_INVALID" }));

    const expired = store.createInvitation("INVITE1", owner.access.accessToken, "viewer");
    now += 11;
    expect(() => store.join("INVITE1", { inviteToken: expired.token, clientId: "late", displayName: "迟到" })).toThrowError(expect.objectContaining({ code: "INVITATION_EXPIRED" }));
  });

  it("allows only one concurrent join to consume an invitation", async () => {
    const secrets = ["owner-access", "single-invite", "winner-access"];
    const store = createRoomStore({ generateId: () => "INVITE2", generateSecret: () => secrets.shift()! });
    const owner = store.create({}, { clientId: "owner", displayName: "Owner" });
    const invitation = store.createInvitation("INVITE2", owner.access.accessToken, "viewer");

    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => store.join("INVITE2", {
        inviteToken: invitation.token,
        clientId: "viewer-a",
        displayName: "Viewer A",
      })),
      Promise.resolve().then(() => store.join("INVITE2", {
        inviteToken: invitation.token,
        clientId: "viewer-b",
        displayName: "Viewer B",
      })),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ code: "INVITATION_INVALID" }),
    });
  });
});
