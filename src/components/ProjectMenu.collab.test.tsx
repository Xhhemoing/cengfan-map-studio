/**
 * 协作面板的处境分类:离线(等网络回来、改动不会丢)与终局(房间已过期/已失效,不会再重连)
 * 必须给出不同的说法。面板此前只渲染 status/message,`collaborationOffline` 没有任何消费方。
 */
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectMenu, type ProjectMenuProps } from "./ProjectMenu";

const roots: { root: Root; container: HTMLDivElement }[] = [];

const baseProps: ProjectMenuProps = {
  roomId: "ROOM01",
  roomVersion: 7,
  roomInput: "ROOM01",
  inviteTokenInput: "",
  roomRole: "owner",
  members: [{ clientId: "c-local", role: "owner", joinedAt: "", lastSeenAt: "" }],
  ownClientId: "c-local",
  roomReadonly: false,
  roomClosed: false,
  invitationToken: null,
  hasStoredRoomAccess: true,
  collaborationStatus: "connected",
  collaborationMessage: "增量同步已完成",
  collaborationOpen: true,
  pngScale: 2,
  transparentExport: false,
  syncStatus: "idle",
  onSetCollaborationOpen: () => {},
  onRoomInputChange: () => {},
  onInviteTokenInputChange: () => {},
  onCreateInvitation: () => {},
  onSetRoomAccess: () => {},
  onLeaveRoom: () => {},
  onStartRoom: () => {},
  onJoinRoom: () => {},
  onNewProject: () => {},
  onRestoreLocal: () => {},
  onSaveLocal: () => {},
  onPngScaleChange: () => {},
  onTransparentChange: () => {},
  onExportSvg: () => {},
  onExportProject: () => {},
  onImportProject: () => {},
};

function renderMenu(overrides: Partial<ProjectMenuProps> = {}): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ProjectMenu {...baseProps} {...overrides} />));
  return container;
}

const panelText = (container: HTMLDivElement): string => container.querySelector(".collaboration-popover")?.textContent ?? "";

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("ProjectMenu collaboration state", () => {
  it("says nothing about the network while the room is healthy", () => {
    const container = renderMenu();

    expect(container.querySelector("[data-collaboration-offline]")).toBeNull();
    expect(container.querySelector("[data-collaboration-terminal]")).toBeNull();
    expect(panelText(container)).toContain("增量同步已完成");
  });

  it("tells the user their local edits survive a partition", () => {
    const container = renderMenu({
      collaborationOffline: true,
      collaborationStatus: "error",
      collaborationMessage: "网络已断开，本地修改会保留，恢复后自动续传",
    });

    const notice = container.querySelector("[data-collaboration-offline]");
    expect(notice?.textContent).toContain("本地修改会保留");
    expect(notice?.textContent).toContain("自动重连");
    expect(container.querySelector("[data-collaboration-terminal]")).toBeNull();
  });

  it("stops promising a reconnect once the room has expired", () => {
    const container = renderMenu({
      roomExpired: true,
      collaborationStatus: "error",
      collaborationMessage: "房间已过期或已失效，请重新创建房间或让创建者重新邀请",
    });

    const terminal = container.querySelector('[data-collaboration-terminal="expired"]');
    expect(terminal?.textContent).toContain("房间已过期或已失效");
    expect(terminal?.textContent).toContain("不会再自动重连");
    expect(panelText(container)).toContain("模式：已失效");
    // 终局房间没有可用的房间操作:邀请与只读开关都不该继续摆在那里。
    expect(panelText(container)).not.toContain("邀请编辑者");
    expect(panelText(container)).not.toContain("关闭房间");
  });

  it("never shows the offline reassurance for a room that will not come back", () => {
    const container = renderMenu({
      roomExpired: true,
      collaborationOffline: true,
      collaborationStatus: "error",
      collaborationMessage: "房间已过期或已失效，请重新创建房间或让创建者重新邀请",
    });

    expect(container.querySelector("[data-collaboration-offline]")).toBeNull();
    expect(container.querySelector('[data-collaboration-terminal="expired"]')).not.toBeNull();
  });

  it("keeps the closed-room notice ahead of the expiry notice", () => {
    const container = renderMenu({
      roomClosed: true,
      roomExpired: true,
      collaborationOffline: true,
      collaborationStatus: "closed",
      collaborationMessage: "房间已关闭，无法继续同步或编辑",
    });

    expect(panelText(container)).toContain("模式：已关闭");
    expect(container.querySelector(".collaboration-closed")?.textContent).toContain("房间已关闭");
    expect(container.querySelector("[data-collaboration-offline]")).toBeNull();
  });

  /**
   * 服务端已经知道这间房活不过一次重启(R6-2 的 `persistedAtLastFlush`),房里的人却只能
   * 从服务器控制台里读到这件事。这条提示是他们唯一的告知渠道,所以不可关闭。
   */
  describe("persistence degradation notice", () => {
    const PERSIST_COPY = "该房间体量超过服务器持久化上限，服务器重启后将无法恢复，请及时导出备份";

    it("warns a connected room that it will not survive a server restart", () => {
      const container = renderMenu({ roomPersistenceDegraded: true });

      const notice = container.querySelector('[data-collaboration-persist="degraded"]');
      expect(notice?.textContent).toContain(PERSIST_COPY);
      expect(notice?.getAttribute("role")).toBe("status");
      expect(notice?.classList.contains("collaboration-persist-degraded")).toBe(true);
      // 不可关闭:提示里不该有任何能让它消失的控件。
      expect(notice?.querySelector("button")).toBeNull();
      // 纯附加:健康房间原本的协作操作一个都不少。
      expect(panelText(container)).toContain("邀请编辑者");
      expect(container.querySelector("[data-collaboration-offline]")).toBeNull();
      expect(container.querySelector("[data-collaboration-terminal]")).toBeNull();
    });

    it("says nothing when the server reports the room is persisted", () => {
      expect(renderMenu().querySelector("[data-collaboration-persist]")).toBeNull();
      expect(renderMenu({ roomPersistenceDegraded: false }).querySelector("[data-collaboration-persist]")).toBeNull();
    });

    it("yields to the closed-room notice", () => {
      const container = renderMenu({
        roomPersistenceDegraded: true,
        roomClosed: true,
        collaborationStatus: "closed",
        collaborationMessage: "房间已关闭，无法继续同步或编辑",
      });

      // 房间已经关了,"及时导出备份"是一条无法执行的建议。
      expect(container.querySelector("[data-collaboration-persist]")).toBeNull();
      expect(container.querySelector(".collaboration-closed")?.textContent).toContain("房间已关闭");
    });

    it("yields to the expired-room notice", () => {
      const container = renderMenu({
        roomPersistenceDegraded: true,
        roomExpired: true,
        collaborationStatus: "error",
        collaborationMessage: "房间已过期或已失效，请重新创建房间或让创建者重新邀请",
      });

      expect(container.querySelector("[data-collaboration-persist]")).toBeNull();
      expect(container.querySelector('[data-collaboration-terminal="expired"]')).not.toBeNull();
    });

    it("yields to the offline notice while the connection is the more urgent problem", () => {
      const container = renderMenu({
        roomPersistenceDegraded: true,
        collaborationOffline: true,
        collaborationStatus: "error",
        collaborationMessage: "网络已断开，本地修改会保留，恢复后自动续传",
      });

      expect(container.querySelector("[data-collaboration-persist]")).toBeNull();
      expect(container.querySelector("[data-collaboration-offline]")?.textContent).toContain("本地修改会保留");
    });

    it("keeps the note out of the disconnected join form", () => {
      const container = renderMenu({ roomId: null, roomPersistenceDegraded: true });

      expect(container.querySelector("[data-collaboration-persist]")).toBeNull();
    });
  });

  it("reports both processes on the join form when there is no room yet", () => {
    const offline = renderMenu({ roomId: null, collaborationOffline: true, collaborationStatus: "error" });
    expect(offline.querySelector("[data-collaboration-offline]")?.textContent).toContain("本地修改会保留");

    const expired = renderMenu({ roomId: null, roomExpired: true, collaborationStatus: "error" });
    expect(expired.querySelector('[data-collaboration-terminal="expired"]')?.textContent).toContain("房间已过期或已失效");
    expect(expired.querySelector("[data-collaboration-offline]")).toBeNull();
  });
});
