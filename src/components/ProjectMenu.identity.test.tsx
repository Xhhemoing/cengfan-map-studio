import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { COLLABORATION_DISPLAY_NAME_KEY } from "../lib/app-constants";
import type { RoomMember } from "../lib/collaboration-client";
import { ProjectMenu, type ProjectMenuProps } from "./ProjectMenu";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function member(clientId: string, role: RoomMember["role"], joinedAt: string): RoomMember {
  return { clientId, role, joinedAt, lastSeenAt: joinedAt };
}

function baseProps(overrides: Partial<ProjectMenuProps> = {}): ProjectMenuProps {
  return {
    roomId: null,
    roomVersion: 0,
    roomInput: "",
    inviteTokenInput: "",
    roomRole: null,
    members: [],
    ownClientId: "client-self",
    roomReadonly: false,
    roomClosed: false,
    invitationToken: null,
    hasStoredRoomAccess: false,
    collaborationStatus: "idle",
    collaborationMessage: "未连接时不会上传或覆盖工程",
    collaborationOpen: true,
    pngScale: 1,
    transparentExport: false,
    exportState: "idle",
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
    onExportPng: () => {},
    onExportSvg: () => {},
    onExportProject: () => {},
    onImportProject: () => {},
    ...overrides,
  };
}

function renderMenu(overrides: Partial<ProjectMenuProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ProjectMenu {...baseProps(overrides)} />));
  return container;
}

function connectedRoomProps(): Partial<ProjectMenuProps> {
  return {
    roomId: "ROOM01",
    roomVersion: 3,
    roomRole: "owner",
    collaborationStatus: "connected",
    collaborationMessage: "增量同步已完成",
    members: [
      member("client-self", "owner", "2026-08-24T10:00:00.000Z"),
      member("abcdef123456", "viewer", "2026-08-24T10:05:00.000Z"),
    ],
  };
}

function changeInput(input: HTMLInputElement, value: string): void {
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
});

describe("ProjectMenu collaboration identity", () => {
  it("makes collaboration discoverable from the project menu trigger", () => {
    const container = renderMenu();

    const trigger = container.querySelector(".project-menu > summary");
    expect(trigger?.getAttribute("aria-label")).toBe("打开项目与协作菜单");
  });

  it("shows every member role as text, not only via the crown emoji", () => {
    const container = renderMenu(connectedRoomProps());

    const roster = container.querySelector('[aria-label="房间成员"]');
    expect(roster).not.toBeNull();
    const rows = Array.from(roster!.querySelectorAll("li"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const roleText = row.querySelector(".collaboration-members__role")?.textContent ?? "";
      expect(roleText.length).toBeGreaterThan(0);
    }
    expect(rows.map((row) => row.querySelector(".collaboration-members__role")?.textContent)).toEqual(["创建者", "仅查看"]);
    // 👑 remains a decoration: hidden from the accessibility tree.
    const crownHost = rows[0]!.querySelector('[aria-hidden="true"]');
    expect(crownHost?.textContent).toContain("👑");
  });

  it("exposes name, role, and capability through each row's aria-label", () => {
    window.localStorage.setItem(COLLABORATION_DISPLAY_NAME_KEY, "张委员");
    const container = renderMenu(connectedRoomProps());

    const rows = Array.from(container.querySelectorAll('[aria-label="房间成员"] li'));
    expect(rows[0]!.getAttribute("aria-label")).toBe("张委员，创建者，可编辑并邀请");
    expect(rows[1]!.getAttribute("aria-label")).toBe("成员 abcdef，仅查看，不可修改");
  });

  it("shows the stored local nickname on the own row", () => {
    window.localStorage.setItem(COLLABORATION_DISPLAY_NAME_KEY, "张委员");
    const container = renderMenu(connectedRoomProps());

    const rows = Array.from(container.querySelectorAll('[aria-label="房间成员"] li'));
    expect(rows[0]!.textContent).toContain("张委员（我）");
    expect(rows[1]!.textContent).toContain("成员 abcdef");
  });

  it("renders the role summary as text when the role is still unconfirmed", () => {
    const container = renderMenu({ ...connectedRoomProps(), roomRole: null });
    expect(container.querySelector(".collaboration-popover")?.textContent).toContain("正在确认权限");
  });

  it("offers an editable nickname field before joining and persists the normalized value", () => {
    const container = renderMenu();

    const input = container.querySelector<HTMLInputElement>(".collaboration-display-name input");
    expect(input).not.toBeNull();
    expect(input!.disabled).toBe(false);
    const label = container.querySelector<HTMLLabelElement>(".collaboration-display-name label");
    expect(label?.textContent).toContain("房间内昵称");
    expect(label?.htmlFor).toBe(input!.id);

    changeInput(input!, "  李 老师  ");
    expect(input!.value).toBe("  李 老师  ");
    expect(window.localStorage.getItem(COLLABORATION_DISPLAY_NAME_KEY)).toBe("李 老师");
  });

  it("locks the nickname field while connected and explains why in text", () => {
    const container = renderMenu(connectedRoomProps());

    const input = container.querySelector<HTMLInputElement>(".collaboration-display-name input");
    expect(input).not.toBeNull();
    expect(input!.disabled).toBe(true);
    expect(container.querySelector(".collaboration-display-name")?.textContent).toContain("断开后可修改昵称");
  });

  it("states that the nickname is a device preference, not an account", () => {
    const container = renderMenu();
    expect(container.querySelector(".collaboration-display-name")?.textContent).toContain("不是账号");
  });

  it("keeps project student data out of the popover and out of storage", () => {
    window.localStorage.setItem(COLLABORATION_DISPLAY_NAME_KEY, "张委员");
    const container = renderMenu(connectedRoomProps());

    // The menu receives no project/student props; its DOM must not surface any.
    expect(container.textContent).not.toMatch(/学生|名单|林舟/);

    // Changing the nickname only ever touches the display-name key.
    const menuOnly = renderMenu();
    const input = menuOnly.querySelector<HTMLInputElement>(".collaboration-display-name input")!;
    changeInput(input, "李老师");
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index));
    expect(keys).toEqual([COLLABORATION_DISPLAY_NAME_KEY]);
  });
});
