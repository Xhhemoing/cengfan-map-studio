/**
 * Public-host helpers: Vite `base`, GitHub Pages project sites, and the
 * static-demo banner. Hash routing still works when `base` is not `/`.
 */

export const PROJECT_SOURCE_URL = "https://github.com/Xhhemoing/cengfan-map-studio";

export const STATIC_HOST_API_HINT =
  "当前站点没有后端接口。公开演示只在浏览器本地保存工程；协作房间和智能助手需要自建 Node 服务。";

export function normalizePublicBasePath(baseUrl: string | undefined): string {
  const trimmed = (baseUrl ?? "/").trim() || "/";
  if (trimmed === "./") return "/";
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

export function stripPublicBase(pathname: string, baseUrl: string | undefined): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const base = normalizePublicBasePath(baseUrl);
  if (base === "/") return normalizedPath;
  const prefix = base.slice(0, -1);
  if (normalizedPath === prefix || normalizedPath === `${prefix}/`) return "/";
  if (normalizedPath.startsWith(`${prefix}/`)) {
    const rest = normalizedPath.slice(prefix.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return normalizedPath;
}

export function isPrototypePath(pathname: string, baseUrl: string | undefined = import.meta.env.BASE_URL): boolean {
  const relative = stripPublicBase(pathname, baseUrl).replace(/\/+$/, "") || "/";
  return relative === "/prototype";
}

export function isPublicDemoBuild(): boolean {
  return import.meta.env.VITE_PUBLIC_DEMO === "1";
}
