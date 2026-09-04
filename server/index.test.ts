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

  it("uses the default port for malformed values and accepts valid ports", () => {
    // 默认参数取自 process.env.PORT：先摘掉宿主环境，否则开发机上导出了 PORT 就会假失败。
    const previousPort = process.env.PORT;
    delete process.env.PORT;
    try {
      expect(resolvePort(undefined)).toBe(DEFAULT_PORT);
      expect(resolvePort("0")).toBe(DEFAULT_PORT);
      expect(resolvePort("not-a-port")).toBe(DEFAULT_PORT);
      expect(resolvePort("8790")).toBe(8790);
    } finally {
      if (previousPort === undefined) delete process.env.PORT;
      else process.env.PORT = previousPort;
    }
  });

  it("lets the operator bind to a single interface via HOST", () => {
    const previousHost = process.env.HOST;
    delete process.env.HOST;
    try {
      // 默认保持 0.0.0.0：容器与既有部署依赖它，改默认会让人升级后连不上。
      expect(resolveBindHost(undefined)).toBe(DEFAULT_BIND_HOST);
      expect(resolveBindHost("")).toBe(DEFAULT_BIND_HOST);
      expect(resolveBindHost("   ")).toBe(DEFAULT_BIND_HOST);
      // 放在 nginx / caddy 后面时，必须能把进程收回环回地址，不让端口直接对公网。
      expect(resolveBindHost("127.0.0.1")).toBe("127.0.0.1");
      expect(resolveBindHost(" 127.0.0.1 ")).toBe("127.0.0.1");
      expect(resolveBindHost("::1")).toBe("::1");
      // 环境变量是运维唯一的开关，必须真的被读到。
      process.env.HOST = "127.0.0.1";
      expect(resolveBindHost()).toBe("127.0.0.1");
    } finally {
      if (previousHost === undefined) delete process.env.HOST;
      else process.env.HOST = previousHost;
    }
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
