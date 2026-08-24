import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { StorageNotice, StorageNoticeActionError, StorageNoticeExportAction } from "./StorageNotice";
import { ProjectStoreError } from "../lib/project-store";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function render(view: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(view));
  return container;
}

function notice(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-store-health="memory"]')!;
}

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
  roots = [];
});

describe("StorageNotice", () => {
  it("announces the degraded storage as an inert status banner", () => {
    const banner = notice(render(<StorageNotice />));

    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.classList.contains("workbench-storage-notice")).toBe(true);
    // .workbench-resume 带 hover 高亮与 :active { transform: scale(.985) },状态播报不该有按钮动效。
    expect(banner.classList.contains("workbench-resume")).toBe(false);
    expect(banner.querySelector(".workbench-resume-icon")).toBeNull();
    expect(banner.querySelector(".workbench-resume-body")).toBeNull();
    expect(banner.querySelector(".workbench-resume-cta")).toBeNull();
    expect(banner.textContent).toContain("本次编辑不会保存到本机，请及时导出工程备份");
    expect(banner.textContent).toContain("浏览器本机存储不可用");
  });

  it("prefers the typed write-back failure over the generic explanation", () => {
    const quota = new ProjectStoreError("quota-exceeded", "本机存储空间不足，请清理浏览器数据或删除不再需要的项目后重试。");
    const banner = notice(render(<StorageNotice recoverError={quota} />));

    expect(banner.textContent).toContain("本机存储空间不足");
    expect(banner.textContent).not.toContain("浏览器本机存储不可用");
  });

  it("renders no export list when the route has no affordance to offer", () => {
    const banner = notice(render(<StorageNotice />));
    expect(banner.querySelector(".workbench-storage-notice-list")).toBeNull();
    expect(banner.querySelector("button")).toBeNull();
  });

  it("renders the export affordances the route passes in", () => {
    let exported = "";
    const banner = notice(render(
      <StorageNotice
        exportActions={
          <>
            <StorageNoticeExportAction projectId="proj-1" ariaLabel="导出「一班」" onExport={() => { exported = "proj-1"; }}>
              一班（12 人）
            </StorageNoticeExportAction>
            <StorageNoticeActionError message="导出失败：项目不存在" />
          </>
        }
      />,
    ));

    const button = banner.querySelector<HTMLButtonElement>('button[data-export-project-id="proj-1"]')!;
    expect(button.textContent).toBe("一班（12 人）");
    expect(button.getAttribute("aria-label")).toBe("导出「一班」");
    expect(banner.querySelector('[role="alert"]')?.textContent).toBe("导出失败：项目不存在");

    button.click();

    expect(exported).toBe("proj-1");
  });
});
