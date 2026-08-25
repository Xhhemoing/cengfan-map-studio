import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_VERSION,
  BUG_RUNTIME_OPTIONS,
  CHANGELOG_URL,
  ISSUE_CHOOSER_URL,
  ISSUE_URL_ALLOWED_PARAMS,
  MAX_ISSUE_URL_LENGTH,
  REPO_URL,
  USER_GUIDE_URL,
  buildIssueUrl,
  describeClientEnvironment,
  formatEnvironmentForIssue,
  type ClientEnvironment,
} from "./feedback-links";

const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SAFARI_ON_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const EDGE_ON_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36 EdgA/127.0.0.0";

// jsdom 下 import.meta.url 是 http scheme，只能从 vitest 的 root（仓库根）解析。
function readIssueTemplate(fileName: string): string {
  return readFileSync(resolve(process.cwd(), ".github/ISSUE_TEMPLATE", fileName), "utf8");
}

describe("describeClientEnvironment", () => {
  it("reduces the user agent to a coarse system and browser label", () => {
    expect(describeClientEnvironment({ userAgent: CHROME_ON_WINDOWS, hostname: "example.com", port: "" }))
      .toMatchObject({ os: "Windows 10/11", browser: "Chrome 128" });
    expect(describeClientEnvironment({ userAgent: SAFARI_ON_MAC, hostname: "example.com", port: "" }))
      .toMatchObject({ os: "macOS", browser: "Safari 17" });
    expect(describeClientEnvironment({ userAgent: EDGE_ON_ANDROID, hostname: "example.com", port: "" }))
      .toMatchObject({ os: "Android 14", browser: "Edge 127" });
  });

  it("never throws and falls back to explicit unknown labels", () => {
    const env = describeClientEnvironment({ userAgent: "", hostname: "", port: "" });
    expect(env.os).toBe("未知系统");
    expect(env.browser).toBe("未知浏览器");
    expect(env.runtime).toBe("不清楚");
  });

  it("keeps the whole user agent string out of the result", () => {
    const env = describeClientEnvironment({ userAgent: CHROME_ON_WINDOWS, hostname: "localhost", port: "5173" });
    expect(env.os).not.toContain("AppleWebKit");
    expect(env.browser).not.toContain("Mozilla");
    expect(formatEnvironmentForIssue(env)).toBe("Windows 10/11 + Chrome 128");
  });

  it.each([
    ["localhost", "5173", "本机 npm run dev"],
    ["127.0.0.1", "5173", "本机 npm run dev"],
    ["localhost", "8787", "本机 npm run build && npm run start"],
    ["127.0.0.1", "", "本机 npm run build && npm run start"],
    ["demo.example.com", "", "浏览器打开公网 / Demo"],
    ["cengfan.example.com", "443", "浏览器打开公网 / Demo"],
    ["localhost", "4173", "不清楚"],
  ])("maps %s:%s to the runtime option %s", (hostname, port, expected) => {
    const env = describeClientEnvironment({ userAgent: CHROME_ON_WINDOWS, hostname, port });
    expect(env.runtime).toBe(expected);
    expect(BUG_RUNTIME_OPTIONS).toContain(env.runtime);
  });

  it("never leaks the host itself into the environment description", () => {
    const env = describeClientEnvironment({ userAgent: CHROME_ON_WINDOWS, hostname: "班级.example.com", port: "8443" });
    const text = formatEnvironmentForIssue(env);
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("班级");
    expect(text).not.toContain("http");
    expect(text).not.toContain("?");
  });
});

describe("buildIssueUrl", () => {
  const env: ClientEnvironment = { os: "Windows 10/11", browser: "Chrome 128", runtime: "本机 npm run dev" };

  it("prefills only the environment fields of the bug template", () => {
    const url = new URL(buildIssueUrl("bug", env));
    expect(url.origin + url.pathname).toBe(`${REPO_URL}/issues/new`);
    expect(url.searchParams.get("template")).toBe("bug.yml");
    expect(url.searchParams.get("env")).toBe("Windows 10/11 + Chrome 128");
    expect(url.searchParams.get("where")).toBe("本机 npm run dev");
    expect([...url.searchParams.keys()].every((key) => (ISSUE_URL_ALLOWED_PARAMS as readonly string[]).includes(key))).toBe(true);
  });

  it("does not attach environment metadata to templates that have no such field", () => {
    for (const kind of ["feedback", "feature"] as const) {
      const url = new URL(buildIssueUrl(kind, env));
      expect(url.searchParams.get("template")).toBe(`${kind}.yml`);
      expect(url.searchParams.get("env")).toBeNull();
      expect(url.searchParams.get("where")).toBeNull();
    }
  });

  it("omits the prefill when no environment is supplied", () => {
    const url = new URL(buildIssueUrl("bug"));
    expect([...url.searchParams.keys()]).toEqual(["template"]);
  });

  it("carries no project, roster or room data and stays short", () => {
    const urls = [
      buildIssueUrl("feedback"),
      buildIssueUrl("bug", env),
      buildIssueUrl("feature"),
      ISSUE_CHOOSER_URL,
      USER_GUIDE_URL,
      CHANGELOG_URL,
    ];
    for (const url of urls) {
      expect(url.startsWith(`${REPO_URL}/`)).toBe(true);
      expect(url).not.toMatch(/林舟|北京大学|students|roster|roomId|room=|token|cengfan-project|%7B/i);
      expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    }
  });

  it("refuses to build a URL that grew unexpected parameters", () => {
    const oversized: ClientEnvironment = { ...env, os: "系".repeat(600) };
    expect(() => buildIssueUrl("bug", oversized)).toThrow(/issue url/);
  });
});

describe("CHANGELOG_URL", () => {
  it("points at the changelog on the repository default branch", () => {
    expect(CHANGELOG_URL).toBe(`${REPO_URL}/blob/main/CHANGELOG.md`);
    const url = new URL(CHANGELOG_URL);
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it("links to a file that actually exists in the repository", () => {
    const changelog = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("# 更新日志");
  });
});

describe("APP_VERSION", () => {
  it("stays in sync with the package version it is hand-copied from", () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { version: string };
    expect(APP_VERSION).toBe(manifest.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is a bare version number, not a link or an identifier", () => {
    expect(APP_VERSION).not.toMatch(/林舟|北京大学|http|[?=&/@]/i);
  });
});

describe("issue template drift guard", () => {
  it("keeps every runtime option identical to the bug template dropdown", () => {
    const yml = readIssueTemplate("bug.yml");
    for (const option of BUG_RUNTIME_OPTIONS) {
      expect(yml).toContain(`- ${option}`);
    }
  });

  it("keeps the prefilled field ids present in the bug template", () => {
    const yml = readIssueTemplate("bug.yml");
    expect(yml).toContain("id: env");
    expect(yml).toContain("id: where");
  });

  it("points at issue templates that actually exist", () => {
    for (const kind of ["feedback", "bug", "feature"] as const) {
      const template = new URL(buildIssueUrl(kind)).searchParams.get("template")!;
      expect(readIssueTemplate(template)).toContain("name:");
    }
  });
});
