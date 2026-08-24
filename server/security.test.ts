// @vitest-environment node
import { request as httpRequest } from "node:http";
import type http from "node:http";
import type { AddressInfo } from "node:net";
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
): Promise<RawResponse> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path,
      method,
      headers: body
        ? { "Content-Type": "application/json", "Content-Length": body.byteLength }
        : undefined,
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
    ["GET", "/api/ai/explain", "POST, OPTIONS"],
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
