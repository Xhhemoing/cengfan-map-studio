import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectGrid } from "./ProjectGrid";

function renderGrid(loading = false, hasError = false) {
  const noop = () => undefined;
  return renderToStaticMarkup(<ProjectGrid
    projects={[]} loading={loading} hasError={hasError} openMenuId={null}
    formatUpdatedAt={(value) => value} onOpen={noop} onToggleMenu={noop}
    onRename={noop} onDuplicate={noop} onExport={noop} onDelete={noop} onLoadSample={noop}
  />);
}

describe("ProjectGrid presentation", () => {
  it("gives the workbench one page heading and keeps the empty-state action", () => {
    const html = renderGrid();
    expect(html).toContain("<h1>我的项目</h1>");
    expect(html).toContain('aria-label="项目列表"');
    expect(html).toContain('aria-label="载入示例项目"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('class="workbench-project-count"');
  });

  it("announces loading without reporting a misleading zero project count", () => {
    const html = renderGrid(true);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('class="workbench-project-count"');
    expect(html).not.toContain('还没有项目');
  });

  it("does not disguise a store failure as an empty successful list", () => {
    const html = renderGrid(false, true);
    expect(html).not.toContain('class="workbench-project-count"');
    expect(html).not.toContain('还没有项目');
    expect(html).toContain("<h1>我的项目</h1>");
  });
});
