// @vitest-environment node
import { request as httpRequest } from "node:http";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { createConnection } from "node:net";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAiServer } from "./index";

interface RawResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function rawRequest(
  origin: string,
  path: string,
  method = "GET",
  body?: Buffer,
  headers: http.OutgoingHttpHeaders = {},
): Promise<RawResponse> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path,
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": body.byteLength } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
      }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function rawHttpExchange(origin: string, request: string): Promise<string> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: target.hostname, port: Number(target.port) });
    const chunks: Buffer[] = [];
    socket.on("connect", () => socket.end(request));
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("error", reject);
  });
}

describe("server request security", () => {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => {
      server.close(() => resolve());
    })));
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
    servers.length = 0;
    directories.length = 0;
  });

  it.each([
    "/%2e%2e/secret.txt",
    "/..%2fsecret.txt",
    "//etc/passwd",
  ])("rejects static traversal path %s", async (path) => {
    const root = await mkdtemp(join(tmpdir(), "cengfan-static-traversal-"));
    const staticDir = join(root, "public");
    directories.push(root);
    await mkdir(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(root, "secret.txt"), "outside");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawRequest(origin, path);

    expect(response.status).toBe(403);
    expect(response.body).not.toContain("outside");
  });

  it("does not follow a static-file symlink outside the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "cengfan-static-symlink-"));
    const staticDir = join(root, "public");
    directories.push(root);
    await mkdir(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(root, "secret.txt"), "outside-secret");
    await symlink(join(root, "secret.txt"), join(staticDir, "escape.txt"));
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawRequest(origin, "/escape.txt");

    expect(response.status).toBe(403);
    expect(response.body).not.toContain("outside-secret");
  });

  it("returns a JSON 400 for malformed percent encoding", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-encoding-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawRequest(origin, "/%E0%A4%A");

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "INVALID_URL_ENCODING" } });
  });

  it.each([
    ["POST", "/api/health", "GET, OPTIONS"],
    ["PATCH", "/api/rooms", "POST, OPTIONS"],
  ])("returns 405 for %s %s", async (method, path, allow) => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawRequest(origin, path, method);

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe(allow);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
  });

  it.each([
    "/api/ai/agent",
    "/api/ai/parse-data",
    "/api/ai/propose-edits",
    "/api/ai/explain",
  ])("rejects every non-preflight method on AI route %s", async (path) => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      const response = await rawRequest(origin, path, method);
      expect(response.status, method).toBe(405);
      expect(response.headers.allow, method).toBe("POST, OPTIONS");
      expect(JSON.parse(response.body), method).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
    }
    const head = await rawRequest(origin, path, "HEAD");
    expect(head.status).toBe(405);
    expect(head.headers.allow).toBe("POST, OPTIONS");
    expect(head.body).toBe("");
  });

  it.each([
    ["HEAD", "/api/health", 405],
    ["HEAD", "/api/rooms", 405],
    ["OPTIONS", "/api/health", 204],
    ["OPTIONS", "/api/ai/agent", 204],
    ["OPTIONS", "/api/rooms", 204],
  ])("handles %s consistently on existing route %s", async (method, path, status) => {
    const server = createAiServer({ corsOrigins: ["https://studio.example"] });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawRequest(origin, path, method, undefined, {
      Origin: "https://studio.example",
      "Access-Control-Request-Method": method === "OPTIONS" ? "POST" : "GET",
    });

    expect(response.status).toBe(status);
    expect(response.body).toBe("");
    if (method === "OPTIONS") {
      expect(response.headers["access-control-allow-origin"]).toBe("https://studio.example");
    }
  });

  it("allows request ID preflights only for configured origins", async () => {
    const allowedOrigin = "https://studio.example";
    const server = createAiServer({ corsOrigins: [allowedOrigin] });
    servers.push(server);
    const origin = await startServer(server);
    const preflightHeaders = {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "x-request-id,content-type",
    };

    const allowed = await rawRequest(origin, "/api/ai/agent", "OPTIONS", undefined, {
      Origin: allowedOrigin,
      ...preflightHeaders,
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(allowed.headers["access-control-allow-methods"]).toBe("GET,PUT,POST,OPTIONS");
    expect(allowed.headers["access-control-allow-headers"]?.toLowerCase().split(/,\s*/)).toEqual(
      expect.arrayContaining(["x-request-id", "content-type"]),
    );

    const disallowed = await rawRequest(origin, "/api/ai/agent", "OPTIONS", undefined, {
      Origin: "https://untrusted.example",
      ...preflightHeaders,
    });
    expect(disallowed.status).toBe(204);
    expect(Object.fromEntries(
      Object.entries(disallowed.headers).filter(([name]) => name.startsWith("access-control-")),
    )).toEqual({});
    expect(disallowed.headers.vary).toBeUndefined();
  });

  it("keeps absolute-form API targets inside the API namespace", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-absolute-url-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawHttpExchange(origin, [
      "GET http://attacker.example/api/not-found HTTP/1.1",
      "Host: studio.example",
      "Connection: close",
      "",
      "",
    ].join("\r\n"));

    expect(response).toMatch(/^HTTP\/1\.1 404 /);
    expect(response).toContain('"code":"NOT_FOUND"');
    expect(response).not.toContain("<main>SPA</main>");
  });

  it("rejects HTTP/1.1 requests without Host", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawHttpExchange(origin, [
      "GET /api/health HTTP/1.1",
      "Connection: close",
      "",
      "",
    ].join("\r\n"));

    expect(response).toMatch(/^HTTP\/1\.1 400 /);
  });

  it("rejects an oversized request target at the HTTP parser", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawHttpExchange(origin, [
      `GET /${"a".repeat(17 * 1024)} HTTP/1.1`,
      "Host: studio.example",
      "Connection: close",
      "",
      "",
    ].join("\r\n"));

    expect(response).toMatch(/^HTTP\/1\.1 431 /);
  });

  it("returns 405 for unsupported methods on static resources", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-method-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    const response = await rawRequest(origin, "/", "DELETE");

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("GET, OPTIONS");
  });

  it("keeps the AI body cap when the configured byte limit is invalid", async () => {
    const server = createAiServer({ maxJsonBodyBytes: Number.NaN });
    servers.push(server);
    const origin = await startServer(server);
    const body = Buffer.from(JSON.stringify({
      message: "x".repeat(600 * 1024),
      studentCount: 1,
    }));

    const response = await rawRequest(origin, "/api/ai/explain", "POST", body);

    expect(response.status).toBe(413);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "REQUEST_TOO_LARGE" } });
  });

  it.each([
    ["/api/rooms", { clientId: "owner", displayName: "创建者", snapshot: {} }],
    ["/api/ai/explain", { message: "解释布局", studentCount: 1 }],
  ])("rejects a non-JSON media type on JSON route %s", async (path, input) => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const body = Buffer.from(JSON.stringify(input));

    const response = await rawRequest(origin, path, "POST", body, {
      "Content-Type": "text/plain",
      "X-Request-Id": "unsupported-media",
    });

    expect(response.status).toBe(415);
    expect(JSON.parse(response.body)).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
      requestId: "unsupported-media",
    });
  });

  it("accepts structured JSON media types", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const body = Buffer.from(JSON.stringify({
      clientId: "owner",
      displayName: "创建者",
      snapshot: {},
    }));

    const response = await rawRequest(origin, "/api/rooms", "POST", body, {
      "Content-Type": "application/vnd.cengfan+json; charset=utf-8",
    });

    expect(response.status).toBe(201);
  });

  it.each([
    ["/api/rooms", "INVALID_JSON"],
    ["/api/ai/explain", "AI_VALIDATION_ERROR"],
  ])("rejects malformed UTF-8 JSON on %s", async (path, errorCode) => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const prefix = path === "/api/rooms"
      ? '{"clientId":"owner","displayName":"'
      : '{"message":"';
    const suffix = path === "/api/rooms"
      ? '"}'
      : '","studentCount":1}';
    const body = Buffer.concat([
      Buffer.from(prefix),
      Buffer.from([0xc3, 0x28]),
      Buffer.from(suffix),
    ]);

    const response = await rawRequest(origin, path, "POST", body);

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: errorCode } });
  });
});
