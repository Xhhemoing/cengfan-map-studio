import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectMenu, type ProjectMenuProps } from "./ProjectMenu";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function baseProps(overrides: Partial<ProjectMenuProps> = {}): ProjectMenuProps {
  return {
    roomId: null,
    roomVersion: 0,
    roomInput: "",
    inviteTokenInput: "",
    roomRole: null,
    members: [],
    ownClientId: "self",
    roomReadonly: false,
    roomClosed: false,
    invitationToken: null,
    hasStoredRoomAccess: false,
    collaborationStatus: "idle",
    collaborationMessage: "",
    collaborationOpen: false,
    pngScale: 2,
    transparentExport: false,
    syncStatus: "idle",
    onSetCollaborationOpen: vi.fn(),
    onRoomInputChange: vi.fn(),
    onInviteTokenInputChange: vi.fn(),
    onCreateInvitation: vi.fn(),
    onSetRoomAccess: vi.fn(),
    onLeaveRoom: vi.fn(),
    onStartRoom: vi.fn(),
    onJoinRoom: vi.fn(),
    onNewProject: vi.fn(),
    onRestoreLocal: vi.fn(),
    onSaveLocal: vi.fn(),
    onPngScaleChange: vi.fn(),
    onTransparentChange: vi.fn(),
    onExportSvg: vi.fn(),
    onExportProject: vi.fn(),
    onImportProject: vi.fn(),
    ...overrides,
  };
}

function renderMenu(overrides: Partial<ProjectMenuProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = baseProps(overrides);
  flushSync(() => root.render(<ProjectMenu {...props} />));
  return { container, props };
}

function click(element: Element | null): void {
  if (!element) throw new Error("element missing");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function normalized(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, "");
}

/** WCAG 2.5.3 Label in Name：aria-label 必须包含控件的可见文字。 */
function expectNamesContainVisibleText(container: HTMLElement): void {
  const named = [...container.querySelectorAll<HTMLElement>("button[aria-label], summary[aria-label]")];
  expect(named.length).toBeGreaterThan(0);
  for (const element of named) {
    expect(normalized(element.getAttribute("aria-label")), `visible text of "${element.getAttribute("aria-label")}"`)
      .toContain(normalized(element.textContent));
  }
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("ProjectMenu", () => {
  it("keeps every accessible name aligned with its visible label when idle", () => {
    const { container } = renderMenu();
    expectNamesContainVisibleText(container);

    // 菜单触发器：名称以可见文字「项目」开头。
    const summary = container.querySelector("summary")!;
    expect(summary.getAttribute("aria-label")).toBe("项目菜单");
    expect(normalized(summary.textContent)).toBe("项目");

    // 协作触发器未连接时名称与可见文字一字不差。
    const collaboration = container.querySelector('button[aria-label="增量协作"]')!;
    expect(normalized(collaboration.textContent)).toBe("增量协作");
  });

  it("keeps names aligned with visible labels for a connected owner with the popover open", () => {
    const { container } = renderMenu({
      roomId: "ROOM42",
      roomVersion: 3,
      roomRole: "owner",
      collaborationOpen: true,
      collaborationStatus: "connected",
      invitationToken: "one-time-invite",
      members: [{ clientId: "self", role: "owner", joinedAt: "t0", lastSeenAt: "t0" }],
    });
    expectNamesContainVisibleText(container);

    // 已连接时触发器显示房间码，名称包含它。
    const trigger = container.querySelector('button[aria-label="增量协作房间 ROOM42"]')!;
    expect(trigger.textContent).toContain("ROOM42");
  });

  it("names text-labelled project actions by their visible text without aria-label overrides", () => {
    const { container, props } = renderMenu();
    for (const label of ["新建项目", "恢复最近项目", "保存到本机", "导出工程"]) {
      const button = [...container.querySelectorAll("button")].find((item) => normalized(item.textContent) === normalized(label));
      expect(button, label).toBeDefined();
      expect(button!.hasAttribute("aria-label"), label).toBe(false);
    }
    click([...container.querySelectorAll("button")].find((item) => normalized(item.textContent) === "新建项目")!);
    click([...container.querySelectorAll("button")].find((item) => normalized(item.textContent) === "恢复最近项目")!);
    click([...container.querySelectorAll("button")].find((item) => normalized(item.textContent) === "保存到本机")!);
    expect(props.onNewProject).toHaveBeenCalledTimes(1);
    expect(props.onRestoreLocal).toHaveBeenCalledTimes(1);
    expect(props.onSaveLocal).toHaveBeenCalledTimes(1);
  });

  it("shows the PNG scale select with a visible label identical to its accessible name", () => {
    const { container } = renderMenu();
    const select = container.querySelector('select[aria-label="PNG 导出倍率"]')!;
    const label = select.closest("label")!;
    expect(label.childNodes[0]?.textContent).toBe("PNG 导出倍率");
  });

  it("keeps the pinned force-save name while idle and follows the visible text while saving", () => {
    const idle = renderMenu();
    const idleButton = idle.container.querySelector<HTMLButtonElement>('button[aria-label="强制保存到浏览器本地"]')!;
    expect(normalized(idleButton.textContent)).toBe("保存到浏览器本地");
    expect(idleButton.disabled).toBe(false);

    const saving = renderMenu({ syncStatus: "saving" });
    const savingButton = saving.container.querySelector<HTMLButtonElement>('button[aria-label="保存中"]')!;
    expect(normalized(savingButton.textContent)).toBe("保存中");
    expect(savingButton.disabled).toBe(true);
  });

  it("names the project package import input by the visible 导入工程 label", () => {
    const { container, props } = renderMenu();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入工程"]')!;
    expect(normalized(input.closest("label")?.textContent)).toBe("导入工程");

    Object.defineProperty(input, "files", { configurable: true, value: [] });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(props.onImportProject).toHaveBeenCalledWith(null);
  });
});
