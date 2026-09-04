// @vitest-environment node
// 请求体形状校验、端口解析与生产/开发下的 AI 访问闸门。
import { describe, expect, it } from "vitest";
import { createAiServer, DEFAULT_BIND_HOST, DEFAULT_PORT, resolveBindHost, resolvePort } from "./index";
import { createCollaborationRoom, rawPost, roomHeaders, startServer, installServerFixture } from "./index-test-fixtures";

const { servers } = installServerFixture();

describe("unified application server — request shape and access mode", () => {
  it.each([
    ["room creation", "/api/rooms", null],
    ["AI explanation", "/api/ai/explain", "not-an-object"],
  ])("rejects a non-object JSON body for %s", async (_name, path, body) => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: path === "/api/ai/explain" ? "AI_VALIDATION_ERROR" : "VALIDATION_ERROR" } });
  });

  it("rejects an array transaction body before attempting to find the room", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "initial" });

    const response = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify([]),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  // 端口与绑定网卡的解析已搬到 server/runtime-bindings.ts，用例见同名 .test.ts。
  // 这里只确认 ./index 仍然把它们再导出，既有 import 路径不被破坏。
  it("keeps re-exporting the runtime binding helpers", () => {
    expect(resolvePort("8790")).toBe(8790);
    expect(resolveBindHost("127.0.0.1")).toBe("127.0.0.1");
    expect(DEFAULT_PORT).toBe(8787);
    expect(DEFAULT_BIND_HOST).toBe("0.0.0.0");
  });

  it("requires the workspace token for AI endpoints in locked-down production", async () => {
    const server = createAiServer({
      workspaceApiToken: "workspace-test-token",
      productionConfig: {
        ok: true,
        errors: [],
        config: {
          nodeEnv: "production",
          aiPublicAccess: false,
          trustProxy: false,
          dataDir: ".data",
          aiStateFile: ".data/ai-runtime-state.json",
          shutdownTimeoutMs: 10_000,
        },
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const anonymous = await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 });
    expect(anonymous.status).toBe(401);

    const authenticated = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer workspace-test-token" },
      body: JSON.stringify({ message: "为什么", studentCount: 1 }),
    });
    expect(authenticated.status).toBe(200);
  });

  it("allows anonymous AI requests when AI_PUBLIC_ACCESS is enabled in production", async () => {
    const server = createAiServer({
      workspaceApiToken: "workspace-test-token",
      productionConfig: {
        ok: true,
        errors: [],
        config: {
          nodeEnv: "production",
          aiPublicAccess: true,
          trustProxy: false,
          dataDir: ".data",
          aiStateFile: ".data/ai-runtime-state.json",
          shutdownTimeoutMs: 10_000,
        },
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 });
    expect(response.status).toBe(200);
  });

  it("keeps AI endpoints open without a token in development", async () => {
    const server = createAiServer({
      workspaceApiToken: "workspace-test-token",
      productionConfig: {
        ok: true,
        errors: [],
        config: {
          nodeEnv: "development",
          aiPublicAccess: false,
          trustProxy: false,
          dataDir: ".data",
          aiStateFile: ".data/ai-runtime-state.json",
          shutdownTimeoutMs: 10_000,
        },
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawPost(origin, "/api/ai/explain", { message: "为什么", studentCount: 1 });
    expect(response.status).toBe(200);
  });
});
