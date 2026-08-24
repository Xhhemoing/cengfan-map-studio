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

  it("reports both processes on the join form when there is no room yet", () => {
    const offline = renderMenu({ roomId: null, collaborationOffline: true, collaborationStatus: "error" });
    expect(offline.querySelector("[data-collaboration-offline]")?.textContent).toContain("本地修改会保留");

    const expired = renderMenu({ roomId: null, roomExpired: true, collaborationStatus: "error" });
    expect(expired.querySelector('[data-collaboration-terminal="expired"]')?.textContent).toContain("房间已过期或已失效");
    expect(expired.querySelector("[data-collaboration-offline]")).toBeNull();
  });
});
