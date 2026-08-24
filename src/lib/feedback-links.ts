/**
 * 帮助与反馈外链的装配层。
 *
 * 这里是「哪些信息允许离开本机」的唯一收口点：函数签名只接受粗粒度的运行环境
 * 描述，工程文档、学生名单、协作房间码在类型上就传不进来；`buildIssueUrl` 另有
 * 参数白名单与长度上限做运行时兜底。
 */

export const REPO_URL = "https://github.com/Xhhemoing/cengfan-map-studio";
export const ISSUE_CHOOSER_URL = `${REPO_URL}/issues/new/choose`;
export const USER_GUIDE_URL = `${REPO_URL}/blob/main/USER_GUIDE.md`;
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;

/**
 * 与 package.json 的 version 手抄同步——导入 package.json 会把整份清单
 * （依赖名、脚本）打进客户端产物，为了一个字符串不值得。漂移由测试守着。
 */
export const APP_VERSION = "0.1.0";

export const ISSUE_TEMPLATES = {
  feedback: "feedback.yml",
  bug: "bug.yml",
  feature: "feature.yml",
} as const;

export type IssueKind = keyof typeof ISSUE_TEMPLATES;

/**
 * bug.yml「运行方式」下拉的选项字面量。GitHub Issue Form 靠**选项文本**匹配预填，
 * 一字之差会静默失效，因此有漂移测试守着这四条与模板一致。
 */
export const BUG_RUNTIME_OPTIONS = [
  "浏览器打开公网 / Demo",
  "本机 npm run dev",
  "本机 npm run build && npm run start",
  "不清楚",
] as const;

export type BugRuntime = (typeof BUG_RUNTIME_OPTIONS)[number];

export const ISSUE_URL_ALLOWED_PARAMS = ["template", "labels", "env", "where"] as const;
export const MAX_ISSUE_URL_LENGTH = 512;

export const UNKNOWN_OS = "未知系统";
export const UNKNOWN_BROWSER = "未知浏览器";

export interface ClientEnvironment {
  /** 例如「Windows 10/11」「macOS」「Android 14」；识别不出时为「未知系统」。 */
  os: string;
  /** 例如「Chrome 128」；识别不出时为「未知浏览器」。 */
  browser: string;
  /** 必为 BUG_RUNTIME_OPTIONS 之一。 */
  runtime: BugRuntime;
}

const WINDOWS_NT_NAMES: Record<string, string> = {
  "10.0": "Windows 10/11",
  "6.3": "Windows 8.1",
  "6.2": "Windows 8",
  "6.1": "Windows 7",
};

const BROWSER_PATTERNS: Array<[name: string, pattern: RegExp]> = [
  ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /OPR\/(\d+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /Version\/(\d+)[\d._]*\s+(?:Mobile\/\S+\s+)?Safari\//],
];

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function detectOs(userAgent: string): string {
  const windows = /Windows NT ([\d.]+)/.exec(userAgent);
  if (windows) return WINDOWS_NT_NAMES[windows[1]!] ?? "Windows";
  if (/(iPhone|iPad|iPod)/.test(userAgent)) {
    const version = /OS (\d+)[._]/.exec(userAgent);
    return version ? `iOS ${version[1]}` : "iOS";
  }
  const android = /Android (\d+)/.exec(userAgent);
  if (android) return `Android ${android[1]}`;
  if (/Mac OS X/.test(userAgent)) return "macOS";
  if (/(Linux|X11)/.test(userAgent)) return "Linux";
  return UNKNOWN_OS;
}

function detectBrowser(userAgent: string): string {
  for (const [name, pattern] of BROWSER_PATTERNS) {
    const match = pattern.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return UNKNOWN_BROWSER;
}

function detectRuntime(hostname: string, port: string): BugRuntime {
  const host = hostname.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return "不清楚";
  if (!LOCAL_HOSTNAMES.has(host)) return "浏览器打开公网 / Demo";
  const normalizedPort = port.trim();
  if (normalizedPort === "5173") return "本机 npm run dev";
  if (normalizedPort === "8787" || normalizedPort === "") return "本机 npm run build && npm run start";
  return "不清楚";
}

/**
 * 只从 userAgent 与 host 推断粗粒度环境。不读取工程数据、房间码、localStorage、
 * 路径或查询串；host 仅用于区分本机与公网，其字面量不会出现在结果里。
 */
export function describeClientEnvironment(input: {
  userAgent?: string | null;
  hostname?: string | null;
  port?: string | null;
}): ClientEnvironment {
  const userAgent = typeof input.userAgent === "string" ? input.userAgent : "";
  const hostname = typeof input.hostname === "string" ? input.hostname : "";
  const port = typeof input.port === "string" ? input.port : "";
  return {
    os: detectOs(userAgent),
    browser: detectBrowser(userAgent),
    runtime: detectRuntime(hostname, port),
  };
}

/** 「Windows 10/11 + Chrome 128」——对齐 bug.yml `env` 输入框的 placeholder 写法。 */
export function formatEnvironmentForIssue(environment: ClientEnvironment): string {
  return `${environment.os} + ${environment.browser}`;
}

function finalizeIssueUrl(url: URL): string {
  for (const key of url.searchParams.keys()) {
    if (!(ISSUE_URL_ALLOWED_PARAMS as readonly string[]).includes(key)) {
      throw new Error(`issue url contains unexpected parameters: ${key}`);
    }
  }
  const href = url.toString();
  if (href.length > MAX_ISSUE_URL_LENGTH) {
    throw new Error("issue url exceeds the allowed length");
  }
  return href;
}

/**
 * 组装 Issue 预填链接。只有 bug 模板有 `env` / `where` 字段，其余模板即使传了
 * environment 也不会带上——多余参数会被 GitHub 忽略，只会白白拉长 URL。
 */
export function buildIssueUrl(kind: IssueKind, environment?: ClientEnvironment): string {
  const url = new URL(`${REPO_URL}/issues/new`);
  url.searchParams.set("template", ISSUE_TEMPLATES[kind]);
  if (kind === "bug" && environment) {
    url.searchParams.set("env", formatEnvironmentForIssue(environment));
    url.searchParams.set("where", environment.runtime);
  }
  return finalizeIssueUrl(url);
}
