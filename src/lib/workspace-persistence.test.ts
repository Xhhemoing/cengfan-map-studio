import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { createProjectPackage } from "./project-package";
import {
  loadWorkspacePackage,
  saveWorkspacePackage,
} from "./workspace-persistence";

const projectPackage = createProjectPackage({
  project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
  assets: [],
  fonts: [],
  customTemplates: [],
  renderSettings: { mode: "normal", fixedFps: 20 },
  now: new Date("2026-07-27T00:00:00.000Z"),
});

describe("workspace persistence client", () => {
  it("loads and validates a persisted project package", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      kind: "cengfan-workspace",
      version: 1,
      projectPackage,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const restored = await loadWorkspacePackage(request);

    expect(restored).toEqual(projectPackage);
    expect(request).toHaveBeenCalledWith("/api/workspace", { headers: { Accept: "application/json" } });
  });

  it("returns null when no server workspace has been saved", async () => {
    const request = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(loadWorkspacePackage(request)).resolves.toBeNull();
  });

  it("saves the complete package in the workspace envelope", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }));

    await saveWorkspacePackage(projectPackage, request);

    expect(request).toHaveBeenCalledWith("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "cengfan-workspace",
        version: 1,
        projectPackage,
      }),
    });
  });
});
