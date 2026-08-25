// @vitest-environment node
// 全局工作区读写的令牌闸门、重启后恢复与原子写失败清理。
import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAiServer } from "./index";
import { startServer, installServerFixture, workspaceRequestInit } from "./index-test-fixtures";

const { servers, directories } = installServerFixture();

describe("unified application server — workspace API", () => {
  it("does not expose the global workspace API unless an explicit token is configured", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}/api/workspace`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "WORKSPACE_API_DISABLED" },
    });
  });

  it("requires the configured workspace token for reads and writes", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-auth-"));
    directories.push(dataDir);
    const server = createAiServer({ dataDir, workspaceApiToken: "workspace-test-token" });
    servers.push(server);
    const origin = await startServer(server);
    const snapshot = {
      kind: "cengfan-workspace",
      version: 1,
      projectPackage: {
        kind: "cengfan-project-package",
        version: 2,
        exportedAt: "2026-07-27T00:00:00.000Z",
        project: { schemaVersion: 2, students: [] },
        assets: [],
        fonts: [],
        customTemplates: [],
        renderSettings: { mode: "low", fixedFps: 12 },
      },
    };

    const unauthorized = await fetch(`${origin}/api/workspace`);
    expect(unauthorized.status).toBe(401);
    const saved = await fetch(`${origin}/api/workspace`, {
      method: "PUT",
      ...workspaceRequestInit(),
      body: JSON.stringify(snapshot),
    });
    expect(saved.status).toBe(204);
    const restored = await fetch(`${origin}/api/workspace`, workspaceRequestInit());
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toEqual(snapshot);
  });

  it("persists the complete workspace across server restarts", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-data-"));
    directories.push(dataDir);
    const snapshot = {
      kind: "cengfan-workspace",
      version: 1,
      projectPackage: {
        kind: "cengfan-project-package",
        version: 2,
        exportedAt: "2026-07-27T00:00:00.000Z",
        project: { schemaVersion: 2, students: [{ id: "s1", name: "重启后仍在" }] },
        assets: [{ id: "a1", src: "data:image/png;base64,AA==" }],
        fonts: [],
        customTemplates: [],
        renderSettings: { mode: "low", fixedFps: 12 },
      },
    };

    const firstServer = createAiServer({ dataDir, workspaceApiToken: "workspace-test-token" });
    servers.push(firstServer);
    const firstOrigin = await startServer(firstServer);
    const saved = await fetch(`${firstOrigin}/api/workspace`, {
      method: "PUT",
      ...workspaceRequestInit(),
      body: JSON.stringify(snapshot),
    });
    expect(saved.status).toBe(204);
    await new Promise<void>((resolve) => firstServer.close(() => resolve()));
    servers.splice(servers.indexOf(firstServer), 1);

    const restartedServer = createAiServer({ dataDir, workspaceApiToken: "workspace-test-token" });
    servers.push(restartedServer);
    const restartedOrigin = await startServer(restartedServer);
    const restored = await fetch(`${restartedOrigin}/api/workspace`, workspaceRequestInit());

    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toEqual(snapshot);
  });

  it("removes the workspace temp file when the rename fails, and still reports the rename error", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-workspace-rename-"));
    directories.push(dataDir);
    // 最终路径被一个同名目录占住：临时文件照常写成功，只有 rename(2) 带着内核 errno 失败。
    // 这是 R8-8「临时路径被占」的反面，两边合起来覆盖住原子写的两步各自出事的情形。
    await mkdir(join(dataDir, "workspace.json"));
    const server = createAiServer({ dataDir, workspaceApiToken: "workspace-test-token" });
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}/api/workspace`, {
      method: "PUT",
      ...workspaceRequestInit(),
      body: JSON.stringify({
        kind: "cengfan-workspace",
        version: 1,
        projectPackage: { kind: "cengfan-project-package", version: 2, project: { schemaVersion: 2, students: [] } },
      }),
    });

    // 清理临时文件不能把原始的 rename 失败吞掉：调用方仍要看到真实 errno。
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR", message: expect.stringContaining("EISDIR") },
    });
    // 反复失败时每个进程都会留下一份 <file>.<pid>.tmp，不清就是往数据目录里堆垃圾。
    expect((await readdir(dataDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
