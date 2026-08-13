import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { loadLocalWorkspaceEntry } from "./local-workspace-entry";
import { createProjectDocument, serializeProjectDocument } from "./project-document";
import { createProjectPackage } from "./project-package";
import { sampleStudents } from "./project-data";
import { createMemoryProjectStore } from "./project-store";
import { ProjectWorkbench } from "../components/ProjectWorkbench";

let roots: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(() => {
  window.localStorage.clear();
});

describe("loadLocalWorkspaceEntry", () => {
  it("returns null when no local workspace exists", async () => {
    expect(await loadLocalWorkspaceEntry()).toBeNull();
  });

  it("returns the mirror package when the workspace mirror exists", async () => {
    const pack = createProjectPackage({
      project: createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" }),
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-08-13T00:00:00.000Z"),
    });
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(pack));

    const entry = await loadLocalWorkspaceEntry();
    expect(entry?.source).toBe("mirror");
    expect(entry?.pack.exportedAt).toBe("2026-08-13T00:00:00.000Z");
    expect(entry?.pack.project.students).toHaveLength(sampleStudents.length);
  });

  it("converts the legacy draft when no mirror exists", async () => {
    window.localStorage.setItem("cengfan-map-studio:draft-saved-at", "2026-08-12T08:30:00.000Z");
    window.localStorage.setItem(
      "cengfan-map-studio:draft",
      serializeProjectDocument(createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" })),
    );

    const entry = await loadLocalWorkspaceEntry();
    expect(entry?.source).toBe("draft");
    expect(entry?.pack.project.students).toHaveLength(sampleStudents.length);
    expect(entry?.pack.kind).toBe("cengfan-project-package");
  });

  it("ignores a garbage draft", async () => {
    window.localStorage.setItem("cengfan-map-studio:draft", "not-json{{{");
    expect(await loadLocalWorkspaceEntry()).toBeNull();
  });
});

describe("workbench resume", () => {
  it("offers continuing the local workspace and turns it into a project", async () => {
    const store = createMemoryProjectStore();
    const pack = createProjectPackage({
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-08-13T00:00:00.000Z"),
    });
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(pack));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    const navigate = vi.fn();
    flushSync(() => root.render(<ProjectWorkbench store={store} navigate={navigate} />));
    await vi.waitFor(() => expect(container.textContent).toContain("继续编辑本地内容"));
    container.querySelector<HTMLButtonElement>('button[aria-label^="继续编辑本地内容"]')?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    const projects = await store.list();
    expect(projects.some((p) => p.pack.exportedAt === "2026-08-13T00:00:00.000Z")).toBe(true);
  });
});
