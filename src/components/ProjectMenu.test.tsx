import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectMenu, type ProjectMenuProps } from "./ProjectMenu";

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function renderMenu(overrides: Partial<ProjectMenuProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props: ProjectMenuProps = {
    roomId: null,
    roomVersion: 1,
    roomInput: "",
    inviteTokenInput: "",
    roomRole: null,
    members: [],
    ownClientId: "client-1",
    roomReadonly: false,
    roomClosed: false,
    invitationToken: null,
    hasStoredRoomAccess: false,
    collaborationStatus: "idle",
    collaborationMessage: "",
    collaborationOpen: false,
    pngScale: 2,
    transparentExport: false,
    exportState: "idle",
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
    onExportPng: vi.fn(),
    onExportSvg: vi.fn(),
    onExportProject: vi.fn(),
    onImportProject: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(<ProjectMenu {...props} />));
  return { container, props };
}

function click(element: Element | null): void {
  if (!element) throw new Error("element missing");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("ProjectMenu", () => {
  it("exports PNG and SVG from the poster export group with the shared scale options", () => {
    const onExportPng = vi.fn();
    const onExportSvg = vi.fn();
    const { container } = renderMenu({ onExportPng, onExportSvg });

    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]');
    expect(scale).not.toBeNull();
    expect(scale?.value).toBe("2");

    click(container.querySelector('button[aria-label="导出 PNG"]'));
    click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("导出 SVG")) ?? null);
    expect(onExportPng).toHaveBeenCalledTimes(1);
    expect(onExportSvg).toHaveBeenCalledTimes(1);
  });

  it("greys out both poster exports while one is in flight", () => {
    const { container } = renderMenu({ exportState: "exporting" });

    const png = container.querySelector<HTMLButtonElement>('button[aria-label="导出 PNG"]');
    const svg = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("导出 SVG"));
    // 两个入口写的是同一张海报：放行任意一个都会顶掉在途的那次导出。
    expect(png?.disabled).toBe(true);
    expect(svg?.disabled).toBe(true);
  });

  it("greys out the project package export while a poster export is in flight", () => {
    const { container } = renderMenu({ exportState: "exporting" });

    // 工程包和海报走同一条下载通道：导出在途时再触发一次，会顶掉正在写的那份文件。
    const project = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("导出工程"));
    expect(project?.disabled).toBe(true);
  });

  it("tells the creator how long a room and its invitation live", () => {
    const { container } = renderMenu({ collaborationOpen: true });

    const panel = container.querySelector('section[aria-label="增量协作设置"]')!;
    expect(panel.textContent).toContain("房间保存在服务器内存，约 30 分钟无操作后失效；邀请凭证约 24 小时有效。");
  });

  it("changes the PNG scale and transparency through the supplied callbacks", () => {
    const onPngScaleChange = vi.fn();
    const onTransparentChange = vi.fn();
    const { container } = renderMenu({ onPngScaleChange, onTransparentChange });

    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(scale, "3");
      scale.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPngScaleChange).toHaveBeenCalledWith(3);

    click(container.querySelector('.project-menu__check input[type="checkbox"]'));
    expect(onTransparentChange).toHaveBeenCalledWith(true);
  });

  it("keeps project management and project-file actions wired", () => {
    const onNewProject = vi.fn();
    const onExportProject = vi.fn();
    const { container } = renderMenu({ onNewProject, onExportProject });

    click(container.querySelector('button[aria-label="新建项目"]'));
    click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("导出工程")) ?? null);
    expect(onNewProject).toHaveBeenCalledTimes(1);
    expect(onExportProject).toHaveBeenCalledTimes(1);
  });
});
