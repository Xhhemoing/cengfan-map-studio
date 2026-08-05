// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { createAiServer, DEFAULT_PORT, resolvePort } from "./index";

async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function rawGet(origin: string, path: string): Promise<{ status: number; body: string }> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: "GET" }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

function adminRequestInit(): RequestInit {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return {};
  const username = process.env.ADMIN_USERNAME || "admin";
  const authorization = Buffer.from(`${username}:${password}`).toString("base64");
  return { headers: { Authorization: `Basic ${authorization}` } };
}

function workspaceRequestInit(token = "workspace-test-token"): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

describe("unified application server", () => {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
    servers.length = 0;
    directories.length = 0;
  });

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
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an array transaction body before attempting to find the room", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { title: "initial" } }),
    }).then((response) => response.json()) as { id: string };

    const response = await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("uses the default port for malformed values and accepts valid ports", () => {
    expect(resolvePort(undefined)).toBe(DEFAULT_PORT);
    expect(resolvePort("0")).toBe(DEFAULT_PORT);
    expect(resolvePort("not-a-port")).toBe(DEFAULT_PORT);
    expect(resolvePort("8790")).toBe(8790);
  });

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

  it("returns JSON 404 for unknown API routes instead of the SPA fallback", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-api-404-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}/api/unknown`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects encoded paths that resolve outside the static directory", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-safe-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawGet(origin, "/%2e%2e/%2e%2e/etc/passwd");

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("validates the agent endpoint request shape", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const response = await fetch(`${origin}/api/ai/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: "测试", digest: {} }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("uses the local agent fallback when no AI key is configured", async () => {
    const server = createAiServer({ agentConfig: {
      apiKey: undefined,
      baseUrl: "https://llm.example/v1",
      model: "deepseek-v4-flash",
      timeoutMs: 1000,
      maxTokens: 4000,
    } });
    servers.push(server);
    const origin = await startServer(server);
    const response = await fetch(`${origin}/api/ai/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: "地图缩小一点", digest: { map: { scale: 1 } }, messages: [{ role: "user", content: "地图缩小一点" }] }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ kind: "tool-call", provider: "local-fallback" });
  });

  it("rejects JSON bodies above the configured request limit", async () => {
    const server = createAiServer({ maxJsonBodyBytes: 64 });
    servers.push(server);
    const origin = await startServer(server);

    const response = await fetch(`${origin}/api/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(200) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "REQUEST_TOO_LARGE" } });
  });

  it("only enables CORS for explicitly allowed origins", async () => {
    const server = createAiServer({ corsOrigins: ["https://studio.example"] });
    servers.push(server);
    const origin = await startServer(server);

    const allowed = await fetch(`${origin}/api/health`, { headers: { Origin: "https://studio.example" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://studio.example");
    const denied = await fetch(`${origin}/api/health`, { headers: { Origin: "https://evil.example" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves the built web application and the AI API from one origin", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>蹭饭地图工作室</main>");

    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const [page, health, propose] = await Promise.all([
      fetch(`${origin}/`),
      fetch(`${origin}/api/health`),
      fetch(`${origin}/api/ai/propose-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "按城市分组",
          projectSummary: {
            studentCount: 12,
            templateId: "original",
            dataView: "province",
            cardPreset: "standard",
          },
        }),
      }),
    ]);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain("蹭饭地图工作室");
    expect(health.status).toBe(200);
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      provider: "local-fallback",
    });
    expect(propose.status).toBe(200);
    const proposal = (await propose.json()) as {
      commands?: unknown[];
    };
    expect(proposal.commands?.length).toBeGreaterThan(0);
  });

  it("serves hashed static assets with long immutable caching, gzip, and security headers", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>蹭饭地图工作室</main>");
    await writeFile(join(staticDir, "index-Bf9xZGZi.js"), "console.log('large static asset');\n".repeat(20));

    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const page = await fetch(`${origin}/`);
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");

    const asset = await fetch(`${origin}/index-Bf9xZGZi.js`, {
      headers: { "Accept-Encoding": "gzip" },
    });

    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asset.headers.get("content-encoding")).toBe("gzip");
    expect(asset.headers.get("vary")).toContain("Accept-Encoding");
    expect(asset.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(asset.text()).resolves.toContain("large static asset");
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


  it("creates, reads, updates, and rejects stale collaboration room snapshots", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const createResponse = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { title: "初始" } }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { id: string; version: number };

    const update = await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: "tx-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "更新" } }),
    });
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({ version: 1, snapshot: { title: "更新" } });

    const stale = await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: "tx-2", clientId: "client-b", baseVersion: 0, snapshot: { title: "冲突" } }),
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "VERSION_CONFLICT", currentVersion: 1 } });

    const room = await fetch(`${origin}/api/rooms/${created.id}`);
    await expect(room.json()).resolves.toMatchObject({ version: 1, snapshot: { title: "更新" } });
  });

  it("returns a room code before its initial snapshot upload completes", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const createdResponse = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-fast" }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string; version: number; ready: boolean; snapshot?: unknown };
    expect(created).toMatchObject({ version: 0, ready: false });
    expect(created.snapshot).toBeUndefined();

    const earlyJoin = await fetch(`${origin}/api/rooms/${created.id}`);
    expect(earlyJoin.status).toBe(425);
    await expect(earlyJoin.json()).resolves.toMatchObject({ error: { code: "ROOM_INITIALIZING" } });

    const initialized = await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: "init-1", clientId: "client-fast", baseVersion: 0, snapshot: { title: "ready" } }),
    });
    await expect(initialized.json()).resolves.toMatchObject({ version: 1, ready: true });
    const readyRoom = await fetch(`${origin}/api/rooms/${created.id}`);
    await expect(readyRoom.json()).resolves.toMatchObject({ version: 1, snapshot: { title: "ready" } });
  });

  it("returns only room metadata when a transaction requests a minimal acknowledgement", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { title: "initial" } }),
    }).then((response) => response.json()) as { id: string };

    const updated = await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ txId: "minimal-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "large" } }),
    });
    const body = await updated.json() as Record<string, unknown>;

    expect(body).toMatchObject({ version: 1, ready: true, lastTxId: "minimal-1" });
    expect(body.snapshot).toBeUndefined();
  });

  it("broadcasts only incremental operations for live patch transactions", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { project: { title: "initial" }, assets: ["large"] } }),
    }).then((response) => response.json()) as { id: string };
    const controller = new AbortController();
    const events = await fetch(`${origin}/api/rooms/${created.id}/events?clientId=client-b&version=0`, { signal: controller.signal });
    const reader = events.body!.getReader();
    try {
      await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txId: "patch-live",
          clientId: "client-a",
          baseVersion: 0,
          operations: [{ type: "set", path: ["project", "title"], value: "patched" }],
        }),
      });
      const chunk = await reader.read();
      const stream = new TextDecoder().decode(chunk.value, { stream: true });
      expect(stream).toContain("patch-live");
      expect(stream).toContain("operations");
      expect(stream).toContain("patched");
      expect(stream).not.toContain("large");
      expect(stream).not.toContain("\"snapshot\":");
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });

  it("lets a second client recover from a stale version and continue editing", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { title: "initial" } }),
    }).then((response) => response.json()) as { id: string };

    await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: "a-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "from-a" } }),
    });
    const stale = await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: "b-1", clientId: "client-b", baseVersion: 0, snapshot: { title: "stale-b" } }),
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "VERSION_CONFLICT", currentVersion: 1 } });

    const latest = await fetch(`${origin}/api/rooms/${created.id}`).then((response) => response.json()) as { version: number; snapshot: unknown };
    expect(latest).toMatchObject({ version: 1, snapshot: { title: "from-a" } });
    const recovered = await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: "b-2", clientId: "client-b", baseVersion: latest.version, snapshot: { title: "from-b" } }),
    });
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ version: 2, snapshot: { title: "from-b" } });
  });

  it("broadcasts room snapshots to a second client over SSE", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { title: "initial" } }),
    }).then((response) => response.json()) as { id: string };
    const controller = new AbortController();
    const events = await fetch(`${origin}/api/rooms/${created.id}/events`, { signal: controller.signal });
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    let stream = "";
    const readVersion = async (version: number) => {
      while (!stream.includes(`\"version\":${version}`)) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE stream ended before the room update arrived");
        stream += decoder.decode(chunk.value, { stream: true });
      }
    };
    try {
      expect(events.headers.get("content-type")).toContain("text/event-stream");
      await readVersion(0);
      await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId: "a-sse", clientId: "client-a", baseVersion: 0, snapshot: { title: "broadcast" } }),
      });
      await readVersion(1);
      expect(stream).toContain("event: snapshot");
      expect(stream).toContain("broadcast");
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });

  it("omits the snapshot when broadcasting an acknowledgement to its author", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { payload: "initial" } }),
    }).then((response) => response.json()) as { id: string };
    const controller = new AbortController();
    const events = await fetch(`${origin}/api/rooms/${created.id}/events?clientId=client-a&version=0`, { signal: controller.signal });
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    let stream = "";
    const readVersion = async (version: number) => {
      while (!stream.includes(`\"version\":${version}`)) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE stream ended before the room acknowledgement arrived");
        stream += decoder.decode(chunk.value, { stream: true });
      }
    };
    try {
      await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId: "own-sse", clientId: "client-a", baseVersion: 0, snapshot: { payload: "do-not-echo" } }),
      });
      await readVersion(1);
      expect(stream).not.toContain("do-not-echo");
      expect(stream).toContain("own-sse");
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });

  it("records visits with request details and exposes aggregate analytics", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-visits-"));
    directories.push(dataDir);
    const server = createAiServer({ dataDir, trustProxy: true });
    servers.push(server);
    const origin = await startServer(server);

    const page = await fetch(`${origin}/dashboard?tab=map`, {
      headers: {
        "X-Forwarded-For": "203.0.113.42",
        Referer: "https://example.com/source",
        "User-Agent": "Test Browser",
      },
    });
    expect(page.status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const analytics = await fetch(`${origin}/api/admin/visits`, adminRequestInit());
    expect(analytics.status).toBe(200);
    const body = await analytics.json() as { total: number; uniqueIps: number; visits: Array<Record<string, unknown>> };
    expect(body.total).toBe(1);
    expect(body.uniqueIps).toBe(1);
    expect(body.visits[0]).toMatchObject({ ip: "203.0.113.42", method: "GET", path: "/dashboard", status: 404, referer: "https://example.com/source", userAgent: "Test Browser" });
  });

  it("ignores spoofed forwarded IP headers unless the proxy is trusted", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-visits-untrusted-"));
    directories.push(dataDir);
    const server = createAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);

    await fetch(`${origin}/dashboard`, { headers: { "X-Forwarded-For": "203.0.113.42" } });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const analytics = await fetch(`${origin}/api/admin/visits`, adminRequestInit());
    const body = await analytics.json() as { visits: Array<{ ip: string }> };
    expect(body.visits[0]?.ip).not.toBe("203.0.113.42");
  });

  it("reads legacy visit records without losing their history", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-legacy-visits-"));
    directories.push(dataDir);
    await writeFile(join(dataDir, "visits.json"), JSON.stringify([{ id: "old", occurredAt: "2026-01-01T00:00:00.000Z", path: "/" }]));
    const server = createAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);
    const analytics = await fetch(`${origin}/api/admin/visits`, adminRequestInit());
    await expect(analytics.json()).resolves.toMatchObject({ total: 1, uniqueIps: 1 });
  });
  it("returns the full snapshot when an author reconnects from a stale version", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const created = await fetch(`${origin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a", snapshot: { payload: "initial" } }),
    }).then((response) => response.json()) as { id: string };
    await fetch(`${origin}/api/rooms/${created.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId: "own-reconnect", clientId: "client-a", baseVersion: 0, snapshot: { payload: "recover-me" } }),
    });

    const controller = new AbortController();
    const events = await fetch(`${origin}/api/rooms/${created.id}/events?clientId=client-a&version=0`, { signal: controller.signal });
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    try {
      const chunk = await reader.read();
      const stream = decoder.decode(chunk.value, { stream: true });
      expect(stream).toContain("\"version\":1");
      expect(stream).toContain("recover-me");
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });
});
