// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import type http from "node:http";
// server/static-files.ts 的入口由服务器主循环调用，这些 pin 因此仍然走整机服务器，
// 但断言的全部是静态资源模块自身的行为：内容协商、缓存头、路径拒绝与文件流兜底。
import { createAiServer } from "./index";

const fsHooks = vi.hoisted(() => ({ createReadStream: null as null | ((filePath: string) => unknown) }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const createReadStream = (filePath: unknown, options?: unknown) => (
    fsHooks.createReadStream
      ? fsHooks.createReadStream(String(filePath))
      : (actual.createReadStream as (path: unknown, options?: unknown) => unknown)(filePath, options)
  );
  return { ...actual, default: { ...actual, createReadStream }, createReadStream };
});

async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function rawGet(origin: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path, method: "GET", headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

/** 捕获进程级崩溃信号：写入已结束的响应会以未处理的 error 事件形式冒泡。 */
function captureProcessFailures(): { failures: unknown[]; restore: () => void } {
  const failures: unknown[] = [];
  const record = (error: unknown) => { failures.push(error); };
  process.on("uncaughtException", record);
  process.on("unhandledRejection", record);
  return {
    failures,
    restore: () => {
      process.off("uncaughtException", record);
      process.off("unhandledRejection", record);
    },
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

describe("static file serving", () => {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    fsHooks.createReadStream = null;
    vi.restoreAllMocks();
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections?.();
          }),
      ),
    );
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
    servers.length = 0;
    directories.length = 0;
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

  it("tears the connection down when a static read stream fails after the headers were sent", async () => {
    const monitor = captureProcessFailures();
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-error-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(staticDir, "asset.txt"), "content");
    fsHooks.createReadStream = () => {
      const stream = new Readable({ read() { /* pushed manually */ } });
      setImmediate(() => {
        stream.emit("open");
        stream.push("partial");
        setImmediate(() => stream.emit("error", Object.assign(new Error("read failed"), { code: "EIO" })));
      });
      return stream;
    };
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);
    try {
      await rawGet(origin, "/asset.txt").catch(() => undefined);
      await wait(50);
      expect(monitor.failures).toEqual([]);
      fsHooks.createReadStream = null;
      expect((await rawGet(origin, "/api/live")).status).toBe(200);
    } finally {
      monitor.restore();
    }
  });

  it("answers with JSON when the static file disappears before the stream opens", async () => {
    const monitor = captureProcessFailures();
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-vanish-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(staticDir, "asset.txt"), "content");
    fsHooks.createReadStream = () => {
      const stream = new Readable({ read() { /* pushed manually */ } });
      setImmediate(() => stream.emit("error", Object.assign(new Error("gone"), { code: "ENOENT" })));
      return stream;
    };
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);
    try {
      const response = await rawGet(origin, "/asset.txt");
      expect(response.status).toBe(404);
      expect(JSON.parse(response.body)).toMatchObject({ error: { code: "NOT_FOUND" } });
      expect(monitor.failures).toEqual([]);
    } finally {
      monitor.restore();
    }
  });

  it("keeps rejecting hostile static paths and ignores unsupported range requests", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "cengfan-static-hostile-"));
    directories.push(staticDir);
    await writeFile(join(staticDir, "index.html"), "<main>SPA</main>");
    await writeFile(join(staticDir, "index-Bf9xZGZi.js"), "console.log('asset');\n".repeat(20));
    const server = createAiServer({ staticDir });
    servers.push(server);
    const origin = await startServer(server);

    expect((await rawGet(origin, "/%2e%2e/%2e%2e/etc/passwd")).status).toBe(403);
    expect((await rawGet(origin, "/..%2f..%2fetc/passwd")).status).toBe(403);
    expect((await rawGet(origin, "/%zz")).status).toBe(400);
    expect((await rawGet(origin, "/%00passwd")).status).toBe(400);

    const ranged = await rawGet(origin, "/index-Bf9xZGZi.js", { Range: "bytes=abc-def" });
    expect(ranged.status).toBe(200);
    expect(ranged.body).toContain("console.log('asset');");
  });
});
